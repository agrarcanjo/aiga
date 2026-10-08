export interface CaptureCompatIdentity {
  pid: number;
  /** Exact Windows FILETIME; a PID alone never authorizes an operation. */
  created: string;
  path: string;
  arch: "x64" | "x86" | "arm64" | "unknown";
}
export interface CaptureCompatWindow {
  hwnd: string;
  threadId: number;
  className: string;
  valid: boolean;
  before: number | null;
  affinity: number | null;
  queryError: number;
  clearError: number;
}
export interface CaptureCompatCandidate extends CaptureCompatIdentity {
  windows: CaptureCompatWindow[];
}
export interface CaptureCompatState {
  status: "disabled" | "installing" | "verified" | "partial" | "failed" | "unknown";
  selected: CaptureCompatIdentity | null;
  hookActive: boolean | null;
  windows: CaptureCompatWindow[];
  message: string;
  stage?: string;
  error?: number | string;
  loaded?: boolean;
  initialized?: boolean;
  verifiedAt?: string | null;
  blocked?: string;
  operationId?: string;
}
