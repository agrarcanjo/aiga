#include "protocol.h"
#include "build-id.h"
#include <tlhelp32.h>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <memory>
#include <cstring>

namespace {
struct Handle {
    HANDLE value = nullptr;
    explicit Handle(HANDLE h) : value(h) {}
    ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete;
};
struct Failure { std::string stage; DWORD code; bool uncertain = false; };
std::string Utf8(const std::wstring& value) {
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    std::string result(size, 0);
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
    return result;
}
std::wstring Wide(const std::string& value) {
    int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (!size && !value.empty()) throw Failure{"protocol", ERROR_INVALID_DATA};
    std::wstring result(size, 0);
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), size);
    return result;
}
std::string Json(const std::wstring& value) {
    std::string result = "\"";
    const char hex[] = "0123456789abcdef";
    for (unsigned char c : Utf8(value)) {
        if (c == '"' || c == '\\') { result += '\\'; result += c; }
        else if (c < 32) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
        else result += c;
    }
    return result + '"';
}
std::wstring Path(HANDLE process) {
    wchar_t value[32768]; DWORD size = 32768;
    if (!QueryFullProcessImageNameW(process, 0, value, &size)) throw Failure{"identity", GetLastError()};
    return std::wstring(value, size);
}
std::wstring Base(const std::wstring& path) { return path.substr(path.find_last_of(L"\\/") + 1); }
std::string Arch(HANDLE process) {
    USHORT processMachine = 0, nativeMachine = 0;
    if (!IsWow64Process2(process, &processMachine, &nativeMachine)) throw Failure{"architecture", GetLastError()};
    USHORT machine = processMachine ? processMachine : nativeMachine;
    return machine == IMAGE_FILE_MACHINE_AMD64 ? "x64" : machine == IMAGE_FILE_MACHINE_I386 ? "x86" : machine == IMAGE_FILE_MACHINE_ARM64 ? "arm64" : "unknown";
}
struct Identity { DWORD pid; uint64_t created; std::wstring path; std::string arch; };
Identity Identify(DWORD pid, HANDLE handle) { return {pid, compat::Created(handle), Path(handle), Arch(handle)}; }
void PrintIdentity(const Identity& value) {
    std::cout << "\"pid\":" << value.pid << ",\"created\":\"" << value.created << "\",\"path\":" << Json(value.path) << ",\"arch\":\"" << value.arch << '"';
}
void PrintWindows(const compat::Request& request) {
    std::cout << "\"windows\":[";
    for (DWORD i = 0; i < request.count; ++i) {
        if (i) std::cout << ',';
        const auto& row = request.windows[i];
        std::cout << "{\"hwnd\":\"" << row.hwnd << "\",\"threadId\":" << row.threadId << ",\"className\":" << Json(row.className)
            << ",\"valid\":" << (row.valid ? "true" : "false") << ",\"before\":" << (row.beforeKnown ? std::to_string(row.before) : "null")
            << ",\"affinity\":" << (row.known ? std::to_string(row.affinity) : "null") << ",\"queryError\":" << row.queryError << ",\"clearError\":" << row.clearError << '}';
    }
    std::cout << ']';
}
BOOL CALLBACK DiscoverWindow(HWND hwnd, LPARAM param) {
    auto& request = *reinterpret_cast<compat::Request*>(param);
    if (!compat::Eligible(hwnd, request.pid)) return TRUE;
    if (request.count == compat::MaxWindows) { request.overflow = TRUE; return TRUE; }
    auto& row = request.windows[request.count++];
    row.hwnd = reinterpret_cast<uint64_t>(hwnd); row.valid = TRUE;
    row.threadId = GetWindowThreadProcessId(hwnd, nullptr);
    GetClassNameW(hwnd, row.className, 128);
    row.known = GetWindowDisplayAffinity(hwnd, &row.affinity);
    row.queryError = row.known ? 0 : GetLastError();
    return TRUE;
}
void List() {
    Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
    if (snapshot.value == INVALID_HANDLE_VALUE) throw Failure{"discovery", GetLastError()};
    PROCESSENTRY32W entry{sizeof(entry)};
    bool first = true;
    std::cout << "{\"protocol\":1,\"candidates\":[";
    if (Process32FirstW(snapshot.value, &entry)) do {
        if (_wcsicmp(entry.szExeFile, L"javaw.exe") && _wcsicmp(entry.szExeFile, L"java.exe")) continue;
        Handle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, FALSE, entry.th32ProcessID));
        if (!process.value) continue; // Inaccessible candidates cannot supply a trustworthy identity.
        try {
            const auto identity = Identify(entry.th32ProcessID, process.value);
            if (!identity.created) continue;
            if (!first) std::cout << ','; first = false;
            std::cout << '{'; PrintIdentity(identity); std::cout << ',';
            auto request = std::make_unique<compat::Request>(); request->pid = identity.pid;
            EnumWindows(DiscoverWindow, reinterpret_cast<LPARAM>(request.get())); PrintWindows(*request);
            std::cout << '}';
        } catch (const Failure&) { }
    } while (Process32NextW(snapshot.value, &entry));
    std::cout << "]}";
}
MODULEENTRY32W Module(DWORD pid, const std::wstring& name) {
    Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid));
    if (snapshot.value == INVALID_HANDLE_VALUE) throw Failure{"modules", GetLastError()};
    MODULEENTRY32W entry{sizeof(entry)};
    if (Module32FirstW(snapshot.value, &entry)) do {
        if (!_wcsicmp(entry.szModule, name.c_str())) return entry;
    } while (Module32NextW(snapshot.value, &entry));
    return {};
}
void Revalidate(HANDLE process, const Identity& expected) {
    if (WaitForSingleObject(process, 0) != WAIT_TIMEOUT || compat::Created(process) != expected.created || _wcsicmp(Path(process).c_str(), expected.path.c_str()) || Arch(process) != expected.arch)
        throw Failure{"identity", ERROR_INVALID_PARAMETER};
}
// Remote memory is released only after the thread has finished. Timeout never kills a target thread.
void Remote(HANDLE process, LPTHREAD_START_ROUTINE function, void* data, SIZE_T size, const char* stage) {
    void* memory = VirtualAllocEx(process, nullptr, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if (!memory) throw Failure{stage, GetLastError()};
    SIZE_T transferred = 0;
    if (!WriteProcessMemory(process, memory, data, size, &transferred) || transferred != size) {
        DWORD error = GetLastError(); VirtualFreeEx(process, memory, 0, MEM_RELEASE); throw Failure{stage, error};
    }
    Handle thread(CreateRemoteThread(process, nullptr, 0, function, memory, 0, nullptr));
    if (!thread.value) { DWORD error = GetLastError(); VirtualFreeEx(process, memory, 0, MEM_RELEASE); throw Failure{stage, error}; }
    DWORD wait = WaitForSingleObject(thread.value, 5000);
    if (wait != WAIT_OBJECT_0) throw Failure{stage, wait == WAIT_TIMEOUT ? ERROR_TIMEOUT : GetLastError(), true};
    DWORD exitCode = 0; GetExitCodeThread(thread.value, &exitCode);
    bool read = ReadProcessMemory(process, memory, data, size, &transferred) && transferred == size;
    DWORD error = read ? 0 : GetLastError();
    VirtualFreeEx(process, memory, 0, MEM_RELEASE);
    if (!read) throw Failure{stage, error, true};
    if (exitCode >= 0xC0000000) throw Failure{stage, exitCode, true};
}
std::wstring DllPath() {
    wchar_t exe[32768]; DWORD size = GetModuleFileNameW(nullptr, exe, 32768);
    if (!size || size == 32768) throw Failure{"artifacts", ERROR_BAD_PATHNAME};
    std::wstring path(exe, size);
    return path.substr(0, path.find_last_of(L'\\') + 1) + compat::DllName;
}
void Operate(const std::string& operation, const Identity& expected, const std::string& token) {
    if (token.size() != 64 || token.find_first_not_of("0123456789abcdef") != std::string::npos) throw Failure{"protocol", ERROR_INVALID_DATA};
    if (expected.arch != "x64") throw Failure{"architecture", ERROR_BAD_EXE_FORMAT};
    Handle process(OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_CREATE_THREAD | PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE | SYNCHRONIZE, FALSE, expected.pid));
    if (!process.value) throw Failure{"access", GetLastError()};
    Revalidate(process.value, expected);
    const auto basename = Base(expected.path);
    if (_wcsicmp(basename.c_str(), L"javaw.exe") && _wcsicmp(basename.c_str(), L"java.exe") && _wcsicmp(basename.c_str(), L"aiga-capture-fixture.exe")) throw Failure{"scope", ERROR_ACCESS_DENIED};
    std::wstring dllPath = DllPath();
    if (GetFileAttributesW(dllPath.c_str()) == INVALID_FILE_ATTRIBUTES) throw Failure{"artifacts", ERROR_FILE_NOT_FOUND};
    auto module = Module(expected.pid, compat::DllName);
    if (module.modBaseAddr && _wcsicmp(module.szExePath, dllPath.c_str())) throw Failure{"version-conflict", ERROR_REVISION_MISMATCH};
    if (!module.modBaseAddr && operation == "enable") {
        auto loader = GetProcAddress(GetModuleHandleW(L"kernel32.dll"), "LoadLibraryW");
        HMODULE owner = nullptr;
        if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, reinterpret_cast<LPCWSTR>(loader), &owner)) throw Failure{"load", GetLastError()};
        wchar_t localPath[32768]; GetModuleFileNameW(owner, localPath, 32768);
        const auto remoteOwner = Module(expected.pid, Base(localPath));
        if (!remoteOwner.modBaseAddr) throw Failure{"load", ERROR_MOD_NOT_FOUND};
        auto remoteLoader = reinterpret_cast<LPTHREAD_START_ROUTINE>(remoteOwner.modBaseAddr + (reinterpret_cast<BYTE*>(loader) - reinterpret_cast<BYTE*>(owner)));
        Revalidate(process.value, expected);
        Remote(process.value, remoteLoader, dllPath.data(), (dllPath.size() + 1) * sizeof(wchar_t), "load");
        module = Module(expected.pid, compat::DllName);
        if (!module.modBaseAddr) throw Failure{"load", ERROR_DLL_INIT_FAILED, true};
    }
    auto request = std::make_unique<compat::Request>();
    request->pid = expected.pid; request->created = expected.created;
    request->command = operation == "enable" ? compat::Enable : operation == "disable" ? compat::Disable : compat::Query;
    if (token.size() != 64) throw Failure{"protocol", ERROR_INVALID_DATA};
    for (size_t i = 0; i < 32; ++i) {
        auto digit = [](char c) -> int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; throw Failure{"protocol", ERROR_INVALID_DATA}; };
        request->token[i] = static_cast<BYTE>((digit(token[2 * i]) << 4) | digit(token[2 * i + 1]));
    }
    if (module.modBaseAddr) {
        HMODULE local = LoadLibraryExW(dllPath.c_str(), nullptr, DONT_RESOLVE_DLL_REFERENCES);
        if (!local) throw Failure{"artifacts", GetLastError()};
        // Never execute an RVA from a newer file against an older image still loaded in the target.
        auto buildId = GetProcAddress(local, "AigaCaptureBuildId");
        char remoteBuildId[sizeof(AIGA_CAPTURE_BUILD_ID)]{};
        SIZE_T read = 0;
        const bool matchingBuild = buildId &&
            ReadProcessMemory(process.value, module.modBaseAddr + (reinterpret_cast<BYTE*>(buildId) - reinterpret_cast<BYTE*>(local)), remoteBuildId, sizeof(remoteBuildId), &read) &&
            read == sizeof(remoteBuildId) && std::memcmp(remoteBuildId, AIGA_CAPTURE_BUILD_ID, sizeof(remoteBuildId)) == 0;
        if (!matchingBuild) { FreeLibrary(local); throw Failure{"version-conflict", ERROR_REVISION_MISMATCH}; }
        auto entry = GetProcAddress(local, "AigaCaptureCommand");
        if (!entry) { FreeLibrary(local); throw Failure{"protocol", ERROR_PROC_NOT_FOUND}; }
        auto offset = reinterpret_cast<BYTE*>(entry) - reinterpret_cast<BYTE*>(local);
        FreeLibrary(local);
        if (!entry) throw Failure{"protocol", ERROR_PROC_NOT_FOUND};
        Revalidate(process.value, expected);
        Remote(process.value, reinterpret_cast<LPTHREAD_START_ROUTINE>(module.modBaseAddr + offset), request.get(), sizeof(*request), "command");
        if (request->count > compat::MaxWindows || request->magic != compat::Magic || request->protocol != compat::Protocol || request->size != sizeof(*request)) throw Failure{"protocol", ERROR_INVALID_DATA, true};
        for (DWORD i = 0; i < request->count; ++i) request->windows[i].className[127] = 0;
    } else {
        EnumWindows(DiscoverWindow, reinterpret_cast<LPARAM>(request.get()));
    }
    Revalidate(process.value, expected);
    std::cout << "{\"protocol\":1,\"version\":\"1.0.0\",\"loaded\":" << (module.modBaseAddr ? "true" : "false")
        << ",\"initialized\":" << (request->initialized ? "true" : "false") << ",\"hookActive\":" << (request->hookActive ? "true" : "false")
        << ",\"stable\":" << (request->stable ? "true" : "false") << ",\"overflow\":" << (request->overflow ? "true" : "false")
        << ",\"error\":" << request->error << ",\"stage\":\"command\",\"blocked\":\"" << request->blocked << "\",\"observedAt\":\"" << request->observedAt << "\",\"identity\":{";
    PrintIdentity(expected); std::cout << "},"; PrintWindows(*request); std::cout << '}';
}
std::string Line() {
    std::string value;
    for (int i = 0; i <= 32768; ++i) {
        int c = std::cin.get();
        if (c == '\n') return value;
        if (c == EOF || c == '\r' || c == 0) throw Failure{"protocol", ERROR_INVALID_DATA};
        value += static_cast<char>(c);
    }
    throw Failure{"protocol", ERROR_BAD_LENGTH};
}
uint64_t Number(const std::string& value) {
    if (value.empty() || value.find_first_not_of("0123456789") != std::string::npos) throw Failure{"protocol", ERROR_INVALID_DATA};
    return std::stoull(value);
}
}
int main() {
    try {
        const auto operation = Line();
        if (operation == "list") List();
        else if (operation == "enable" || operation == "query" || operation == "disable") {
            auto pid = Number(Line()); auto created = Number(Line()); auto path = Wide(Line()); auto arch = Line(); auto token = Line();
            if (!pid || pid > MAXDWORD || !created) throw Failure{"identity", ERROR_INVALID_PARAMETER};
            Operate(operation, {static_cast<DWORD>(pid), created, path, arch}, token);
        } else throw Failure{"protocol", ERROR_INVALID_FUNCTION};
        std::cout << std::endl;
        return 0;
    } catch (const Failure& error) {
        std::cout << "{\"protocol\":1,\"error\":" << error.code << ",\"stage\":\"" << error.stage << "\",\"uncertain\":" << (error.uncertain ? "true" : "false") << "}" << std::endl;
    } catch (...) { std::cout << "{\"protocol\":1,\"error\":13,\"stage\":\"protocol\"}" << std::endl; }
    return 1;
}
