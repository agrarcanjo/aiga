#include "protocol.h"
#include <iostream>
#include <string>
#include <vector>
#include <thread>
#include <psapi.h>

// Standalone controlled target. Never starts, restarts or touches a Java process.
DWORD affinity = WDA_EXCLUDEFROMCAPTURE;
bool repeat = true;
LRESULT CALLBACK WindowProc(HWND hwnd, UINT message, WPARAM wp, LPARAM lp) {
    if (message == WM_TIMER && repeat) SetWindowDisplayAffinity(hwnd, affinity);
    if (message == WM_CLOSE) { DestroyWindow(hwnd); return 0; }
    return DefWindowProcW(hwnd, message, wp, lp);
}
int main(int argc, char** argv) {
    if (argc > 1) affinity = static_cast<DWORD>(std::stoul(argv[1]));
    WNDCLASSW wc{}; wc.lpfnWndProc = WindowProc; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"AigaCaptureFixture";
    wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1); RegisterClassW(&wc);
    std::vector<HWND> windows;
    auto create = [&]() {
        HWND hwnd = CreateWindowExW(0, wc.lpszClassName, L"AIGA - teste controlado de captura", WS_OVERLAPPEDWINDOW | WS_VISIBLE, 50, 50, 480, 240, nullptr, nullptr, wc.hInstance, nullptr);
        SetWindowDisplayAffinity(hwnd, affinity); SetTimer(hwnd, 1, 10, nullptr); windows.push_back(hwnd);
    };
    create();
    const DWORD threadId = GetCurrentThreadId();
    std::thread([threadId]() {
        std::string command;
        while (std::getline(std::cin, command)) {
            if (command == "new") PostThreadMessageW(threadId, WM_APP + 1, 0, 0);
            else if (command == "recreate") PostThreadMessageW(threadId, WM_APP + 2, 0, 0);
            else if (command == "monitor") PostThreadMessageW(threadId, WM_APP + 3, 1, 0);
            else if (command == "exclude") PostThreadMessageW(threadId, WM_APP + 3, 17, 0);
            else if (command == "pause") PostThreadMessageW(threadId, WM_APP + 4, 0, 0);
            else if (command == "resume") PostThreadMessageW(threadId, WM_APP + 4, 1, 0);
            else if (command == "contracts") PostThreadMessageW(threadId, WM_APP + 6, 0, 0);
            else if (command == "empty") PostThreadMessageW(threadId, WM_APP + 7, 0, 0);
            else if (command == "metrics") PostThreadMessageW(threadId, WM_APP + 8, 0, 0);
            else if (command == "quit") { PostThreadMessageW(threadId, WM_APP + 5, 0, 0); return; }
        }
        PostThreadMessageW(threadId, WM_APP + 5, 0, 0);
    }).detach();
    std::cout << "{\"pid\":" << GetCurrentProcessId() << ",\"created\":\"" << compat::Created(GetCurrentProcess()) << "\"}" << std::endl;
    // Commands arrive through WM_APP from the test runner: only this fixture supports them.
    MSG message{};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        if (message.message == WM_APP + 1) { create(); continue; }
        if (message.message == WM_APP + 2) { for (auto hwnd : windows) DestroyWindow(hwnd); windows.clear(); create(); continue; }
        if (message.message == WM_APP + 3) { affinity = static_cast<DWORD>(message.wParam); continue; }
        if (message.message == WM_APP + 4) { repeat = message.wParam != 0; continue; }
        if (message.message == WM_APP + 5) break;
        if (message.message == WM_APP + 8) {
            PROCESS_MEMORY_COUNTERS_EX counters{}; counters.cb = sizeof(counters);
            DWORD handles = 0;
            GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters), sizeof(counters));
            GetProcessHandleCount(GetCurrentProcess(), &handles);
            std::cout << "{\"handles\":" << handles << ",\"privateBytes\":" << counters.PrivateUsage << '}' << std::endl;
            continue;
        }
        if (message.message == WM_APP + 7) { for (auto hwnd : windows) DestroyWindow(hwnd); windows.clear(); continue; }
        if (message.message == WM_APP + 6 && !windows.empty()) {
            HWND parent = windows[0];
            HWND child = CreateWindowExW(0, wc.lpszClassName, L"child", WS_CHILD, 0, 0, 10, 10, parent, nullptr, wc.hInstance, nullptr);
            auto check = [](HWND hwnd, DWORD value) {
                SetLastError(0x1234); BOOL ok = SetWindowDisplayAffinity(hwnd, value); DWORD error = GetLastError();
                std::cout << "{\"ok\":" << (ok ? "true" : "false") << ",\"error\":" << error << '}';
            };
            std::cout << "{\"unknown\":"; check(parent, 2);
            std::cout << ",\"child\":"; check(child, 17);
            std::cout << ",\"invalid\":"; check(nullptr, 17);
            std::cout << ",\"none\":"; check(parent, 0);
            std::cout << '}' << std::endl; DestroyWindow(child); continue;
        }
        TranslateMessage(&message); DispatchMessageW(&message);
    }
    for (auto hwnd : windows) DestroyWindow(hwnd);
    return 0;
}
