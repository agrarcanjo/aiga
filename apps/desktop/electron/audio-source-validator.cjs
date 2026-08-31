// Validates audio capture source with short ffmpeg recording
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveFfmpegPath, WASAPI_MISSING_HINT } = require("./ffmpeg-installer.cjs");

function createAudioSourceValidator(options) {
  const logger = options?.logger || { info: () => {}, warn: () => {} };

  function buildWasapiInput(deviceLabel) {
    if (!deviceLabel || deviceLabel === "default") {
      return "audio=default";
    }
    return `audio=${deviceLabel}`;
  }

  function classifyFfmpegError(stderr) {
    const text = String(stderr || "");
    if (/unknown input format\s*['"]?wasapi/i.test(text)) {
      return {
        code: "FFMPEG_WASAPI_MISSING",
        message: WASAPI_MISSING_HINT
      };
    }
    return {
      code: "AUDIO_DEVICE_BUSY",
      message: text.trim() || "Falha ao capturar audio."
    };
  }

  async function testLoopback(deviceLabel, durationSeconds = 3) {
    const ffmpeg = resolveFfmpegPath();
    const tempPath = path.join(os.tmpdir(), `aiga-audio-test-${Date.now()}.wav`);
    const input = buildWasapiInput(deviceLabel);

    return new Promise((resolve) => {
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "wasapi",
        "-i",
        input,
        "-t",
        String(durationSeconds),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-y",
        tempPath
      ];

      logger.info("Audio source test starting", { ffmpeg, deviceLabel, input });
      const proc = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = "";

      proc.stderr.on("data", (c) => {
        stderr += c.toString();
      });

      proc.on("error", (err) => {
        logger.warn("Audio source test spawn error", { message: err.message, ffmpeg });
        resolve({
          ok: false,
          code: "AUDIO_DEVICE_BUSY",
          message: err.message
        });
      });

      proc.on("close", (code) => {
        try {
          if (code !== 0 || !fs.existsSync(tempPath)) {
            const classified = classifyFfmpegError(stderr);
            logger.warn("Audio source test failed", {
              code: classified.code,
              ffmpeg,
              stderr: stderr.trim().slice(0, 500)
            });
            resolve({
              ok: false,
              code: classified.code,
              message: classified.message
            });
            return;
          }

          const size = fs.statSync(tempPath).size;
          fs.unlinkSync(tempPath);

          if (size < 800) {
            resolve({
              ok: false,
              code: "AUDIO_SOURCE_SILENT",
              message: "Nenhum audio audivel detectado na fonte."
            });
            return;
          }

          logger.info("Audio source test OK", { deviceLabel, bytes: size });
          resolve({
            ok: true,
            code: "OK",
            message: "Fonte OK — audio capturado com sucesso.",
            bytesCaptured: size
          });
        } catch (error) {
          resolve({
            ok: false,
            code: "AUDIO_DEVICE_BUSY",
            message: error instanceof Error ? error.message : "Falha no teste"
          });
        }
      });
    });
  }

  async function testSource(profile) {
    if (!profile || profile.mode === "microphone") {
      return {
        ok: true,
        code: "OK",
        message: "Modo microfone — teste via permissao do navegador."
      };
    }

    if (process.platform !== "win32") {
      return {
        ok: false,
        code: "AUDIO_DEVICE_BUSY",
        message: "Loopback disponivel apenas no Windows 10/11."
      };
    }

    const device =
      profile.mode === "system_loopback"
        ? profile.deviceId || "default"
        : profile.deviceId || "default";

    if (profile.mode === "output_device" && (!profile.deviceId || profile.deviceId === "")) {
      logger.warn("output_device without deviceId — falling back to default");
    }

    return testLoopback(device, profile.preRollValidationSeconds || 3);
  }

  return { testSource, testLoopback };
}

module.exports = { createAudioSourceValidator };
