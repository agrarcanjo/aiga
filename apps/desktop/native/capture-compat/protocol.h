#pragma once
#include <windows.h>
#include <cstdint>

namespace compat {
constexpr DWORD Protocol = 1;
constexpr DWORD Magic = 0x41494741;
constexpr DWORD MaxWindows = 256;
constexpr ULONGLONG LeaseMs = 15000;
constexpr wchar_t DllName[] = L"aiga-capture-compat.dll";
enum Command : DWORD { Query = 1, Enable = 2, Disable = 3 };
struct Window {
    uint64_t hwnd;
    DWORD threadId, before, affinity, queryError, clearError;
    BOOL beforeKnown, known, valid;
    wchar_t className[128];
};
// Fixed-size, same-bitness ABI. Never contains function pointers or caller-selected paths.
struct Request {
    DWORD magic = Magic, size = sizeof(Request), protocol = Protocol;
    Command command = Query;
    DWORD pid = 0;
    uint64_t created = 0;
    BYTE token[32]{};
    DWORD error = 0;
    BOOL initialized = FALSE, hookActive = FALSE, stable = FALSE, overflow = FALSE;
    uint64_t blocked = 0, observedAt = 0;
    DWORD count = 0;
    Window windows[MaxWindows]{};
};
inline uint64_t FileTimeValue(FILETIME f) { return (uint64_t(f.dwHighDateTime) << 32) | f.dwLowDateTime; }
inline uint64_t Created(HANDLE process) {
    FILETIME created{}, exit{}, kernel{}, user{};
    return GetProcessTimes(process, &created, &exit, &kernel, &user) ? FileTimeValue(created) : 0;
}
inline bool Eligible(HWND hwnd, DWORD pid) {
    DWORD owner = 0;
    return IsWindow(hwnd) && GetWindowThreadProcessId(hwnd, &owner) && owner == pid &&
        !(GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_CHILD) && GetAncestor(hwnd, GA_ROOT) == hwnd;
}
}
