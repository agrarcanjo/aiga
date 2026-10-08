#include "protocol.h"
#include "build-id.h"
#include <detours.h>
#include <tlhelp32.h>
#include <atomic>
#include <algorithm>
#include <vector>
#include <cstring>

namespace {
using namespace compat;
BOOL (WINAPI* realSet)(HWND, DWORD) = SetWindowDisplayAffinity;
SRWLOCK control = SRWLOCK_INIT;
std::atomic<bool> active{false};
std::atomic<uint64_t> blocked{0};
BYTE sessionToken[32]{};
ULONGLONG leaseUntil = 0;
bool workerStarted = false;
DWORD residualError = 0;

BOOL WINAPI Intercept(HWND hwnd, DWORD affinity) {
    const DWORD saved = GetLastError();
    const bool neutralize = active.load(std::memory_order_acquire) &&
        (affinity == WDA_MONITOR || affinity == WDA_EXCLUDEFROMCAPTURE) && Eligible(hwnd, GetCurrentProcessId());
    SetLastError(saved);
    if (neutralize) {
        blocked.fetch_add(1, std::memory_order_relaxed);
        return TRUE; // Simulated success; verification always uses the real Get API.
    }
    return realSet(hwnd, affinity);
}

DWORD ChangeHook(bool enable) {
    if (active.load() == enable) return ERROR_SUCCESS;
    // Open all handles before suspending threads: no allocations while they are suspended.
    std::vector<HANDLE> threads;
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return GetLastError();
    THREADENTRY32 entry{sizeof(entry)};
    DWORD error = ERROR_SUCCESS;
    if (!Thread32First(snapshot, &entry)) error = GetLastError();
    else do {
        if (entry.th32OwnerProcessID != GetCurrentProcessId() || entry.th32ThreadID == GetCurrentThreadId()) continue;
        HANDLE thread = OpenThread(THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT | THREAD_SET_CONTEXT | THREAD_QUERY_INFORMATION, FALSE, entry.th32ThreadID);
        if (!thread) { error = GetLastError(); if (error == ERROR_INVALID_PARAMETER) { error = 0; continue; } break; }
        threads.push_back(thread);
    } while (Thread32Next(snapshot, &entry));
    CloseHandle(snapshot);
    if (!error) {
        error = DetourTransactionBegin();
        if (!error) {
            error = DetourUpdateThread(GetCurrentThread());
            for (HANDLE thread : threads) {
                if (error) break;
                error = DetourUpdateThread(thread);
            }
            if (!error) error = enable ? DetourAttach(&(PVOID&)realSet, Intercept) : DetourDetach(&(PVOID&)realSet, Intercept);
            if (error) DetourTransactionAbort();
            else {
                error = DetourTransactionCommit();
                if (!error) active.store(enable, std::memory_order_release);
            }
        }
    }
    for (HANDLE thread : threads) CloseHandle(thread);
    return error;
}

DWORD WINAPI LeaseWorker(void*) {
    for (;;) {
        Sleep(1000);
        if (!TryAcquireSRWLockExclusive(&control)) continue;
        if (active.load() && GetTickCount64() >= leaseUntil) {
            residualError = ChangeHook(false);
            if (!residualError) SecureZeroMemory(sessionToken, sizeof(sessionToken));
        }
        ReleaseSRWLockExclusive(&control);
    }
}

struct WindowSet { HWND handles[MaxWindows]{}; DWORD count = 0; bool overflow = false; };
BOOL CALLBACK Collect(HWND hwnd, LPARAM param) {
    auto& set = *reinterpret_cast<WindowSet*>(param);
    if (!Eligible(hwnd, GetCurrentProcessId())) return TRUE;
    if (set.count == MaxWindows) { set.overflow = true; return TRUE; }
    set.handles[set.count++] = hwnd;
    return TRUE;
}
WindowSet Enumerate() {
    WindowSet set;
    if (!EnumWindows(Collect, reinterpret_cast<LPARAM>(&set))) set.overflow = true;
    std::sort(set.handles, set.handles + set.count);
    return set;
}
bool Equal(const WindowSet& a, const WindowSet& b) {
    return !a.overflow && !b.overflow && a.count == b.count && std::equal(a.handles, a.handles + a.count, b.handles);
}
void Reconcile(Request& request, bool clear) {
    // Two successive observations, up to three passes; the timestamp is evidence, not a future guarantee.
    for (int pass = 0; pass < 3; ++pass) {
        const auto before = Enumerate();
        request.count = before.count;
        request.overflow = before.overflow;
        bool verified = true;
        for (DWORD i = 0; i < before.count; ++i) {
            HWND hwnd = before.handles[i];
            auto& row = request.windows[i];
            row = {};
            row.hwnd = reinterpret_cast<uint64_t>(hwnd);
            row.threadId = GetWindowThreadProcessId(hwnd, nullptr);
            row.valid = Eligible(hwnd, request.pid);
            if (!row.valid) { row.queryError = ERROR_INVALID_WINDOW_HANDLE; verified = false; continue; }
            GetClassNameW(hwnd, row.className, 128);
            row.beforeKnown = GetWindowDisplayAffinity(hwnd, &row.before);
            if (clear && Eligible(hwnd, request.pid) && !realSet(hwnd, WDA_NONE)) row.clearError = GetLastError();
            row.valid = Eligible(hwnd, request.pid) && GetWindowThreadProcessId(hwnd, nullptr) == row.threadId;
            if (!row.valid) row.queryError = ERROR_INVALID_WINDOW_HANDLE;
            else {
                row.known = GetWindowDisplayAffinity(hwnd, &row.affinity);
                row.queryError = row.known ? 0 : GetLastError();
            }
            if (!row.valid || !row.known || row.affinity != WDA_NONE || row.clearError) verified = false;
        }
        Sleep(50);
        const auto after = Enumerate();
        request.stable = verified && Equal(before, after);
        // Re-read affinity after the grace interval to catch calls entering before attachment.
        for (DWORD i = 0; i < request.count; ++i) {
            auto& row = request.windows[i];
            HWND hwnd = reinterpret_cast<HWND>(row.hwnd);
            if (!Eligible(hwnd, request.pid) || GetWindowThreadProcessId(hwnd, nullptr) != row.threadId) {
                row.valid = row.known = FALSE; row.queryError = ERROR_INVALID_WINDOW_HANDLE; request.stable = FALSE;
            } else {
                row.known = GetWindowDisplayAffinity(hwnd, &row.affinity);
                row.queryError = row.known ? 0 : GetLastError();
                if (!row.known || row.affinity != WDA_NONE) request.stable = FALSE;
            }
        }
        if (request.stable || !clear) break;
    }
    FILETIME now; GetSystemTimeAsFileTime(&now); request.observedAt = FileTimeValue(now);
}
}

extern "C" __declspec(dllexport) const char AigaCaptureBuildId[] = AIGA_CAPTURE_BUILD_ID;
extern "C" __declspec(dllexport) DWORD WINAPI AigaCaptureCommand(void* parameter) {
    auto* request = static_cast<compat::Request*>(parameter);
    if (!request || request->magic != compat::Magic || request->size != sizeof(*request) || request->protocol != compat::Protocol) return ERROR_REVISION_MISMATCH;
    if (request->pid != GetCurrentProcessId() || request->created != compat::Created(GetCurrentProcess())) return request->error = ERROR_INVALID_PARAMETER;
    if (!TryAcquireSRWLockExclusive(&control)) return request->error = ERROR_BUSY;
    bool authenticated = std::memcmp(request->token, sessionToken, 32) == 0;
    bool nonzero = false;
    for (BYTE byte : request->token) nonzero |= byte != 0;
    request->error = 0;
    if (request->command == compat::Enable) {
        if (!nonzero || (active.load() && !authenticated)) request->error = ERROR_ACCESS_DENIED;
        else {
            if (!workerStarted) {
                HANDLE worker = CreateThread(nullptr, 0, LeaseWorker, nullptr, 0, nullptr);
                if (!worker) request->error = GetLastError();
                else { CloseHandle(worker); workerStarted = true; }
            }
            if (!request->error) {
                request->error = ChangeHook(true);
                if (!request->error) {
                    residualError = 0;
                    std::memcpy(sessionToken, request->token, 32);
                    authenticated = true; leaseUntil = GetTickCount64() + compat::LeaseMs;
                }
            }
        }
    } else if (request->command == compat::Disable) {
        if (active.load() && !authenticated) request->error = ERROR_ACCESS_DENIED;
        else {
            request->error = ChangeHook(false);
            if (!request->error) SecureZeroMemory(sessionToken, 32);
        }
    } else if (request->command != compat::Query) request->error = ERROR_INVALID_FUNCTION;
    if (!request->error && request->command == compat::Query && authenticated && active.load()) leaseUntil = GetTickCount64() + compat::LeaseMs;
    request->initialized = workerStarted;
    request->hookActive = active.load();
    request->blocked = blocked.load();
    if (!request->error) {
        Reconcile(*request, active.load() && authenticated);
        if (residualError) request->error = residualError;
    }
    ReleaseSRWLockExclusive(&control);
    return request->error;
}

BOOL WINAPI DllMain(HINSTANCE, DWORD, void*) {
    // Keep CRT thread notifications: this DLL links the static CRT (/MT).
    // Initialization, threads, transactions and queries are exclusively outside loader lock.
    return TRUE;
}
