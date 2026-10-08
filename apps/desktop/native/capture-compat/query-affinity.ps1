param([Parameter(Mandatory = $true)][UInt64]$WindowHandle)
$ErrorActionPreference = 'Stop'
# Read-only probe used exclusively by the Electron test harness.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AigaAffinityProbe {
    [DllImport("user32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowDisplayAffinity(IntPtr hwnd, out uint affinity);
}
'@
[UInt32]$affinity = 0
$known = [AigaAffinityProbe]::GetWindowDisplayAffinity([IntPtr]::new([Int64]$WindowHandle), [ref]$affinity)
$nativeError = if ($known) { 0 } else { [Runtime.InteropServices.Marshal]::GetLastWin32Error() }
@{ known = $known; affinity = $(if ($known) { $affinity } else { $null }); error = $nativeError } | ConvertTo-Json -Compress
