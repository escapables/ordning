---
summary: 'Ordning AppImage portability profile, rationale, and test matrix.'
read_when:
  - Changing AppImage build/packaging behavior.
  - Debugging Linux GL/EGL startup failures.
  - Preparing a release build.
---

# AppImage Portability Profile

## Goal

Make one AppImage run on both:
- Nouveau host (development machine)
- Intel iGPU laptop (portable clean environment)

## Current Profile (Permanent Baseline)

Implemented by `bin/build-appimage` + `bin/check-appimage-portability`.

### Runtime defaults (in AppRun)

Set at launcher time (before binary startup), only if unset:
- `LIBGL_ALWAYS_SOFTWARE=1`
- `WEBKIT_DISABLE_COMPOSITING_MODE=1`
- `WEBKIT_DISABLE_DMABUF_RENDERER=1`
- `MESA_LOADER_DRIVER_OVERRIDE=llvmpipe`
- `GALLIUM_DRIVER=llvmpipe`

Reason: force CPU rendering path early, avoid host GPU/driver divergence.

### Bundled libs removed from AppImage

- `libwayland-client.so*`
- `libwayland-cursor.so*`
- `libwayland-egl.so*`
- `libwayland-server.so*`
- `libgstgl-1.0.so*`
- `libgbm.so*`
- `libdrm.so*`

Reason: these caused cross-machine EGL/DRM conflicts in testing.

## Release Verification

`bin/build-appimage` now auto-runs portability verification.

Manual matrix required before release:
1. Nouveau machine: launch + basic flows
2. Intel machine: launch + basic flows

If either fails, release is blocked.

## Diagnostics Mode (New)

Use this when a machine fails to launch.

Launch methods:
- `./Ordning_0.1.0_amd64.AppImage --diagnose`
- `ORDNING_DIAGNOSE=1 ./Ordning_0.1.0_amd64.AppImage`

Log path:
- next to the AppImage binary:
  - `./appimage-diagnose.log` (same directory as `Ordning_0.1.0_amd64.AppImage`)

What it captures:
- startup timestamp
- selected EGL/GL/WebKit/Mesa-related environment variables
- stderr/stdout from AppImage launch (including loader diagnostics)

Keep this mode in release builds. It is low overhead and speeds up field debugging.

## Scope and Limits

This profile maximizes compatibility by preferring software rendering.
Tradeoff: lower graphics performance vs GPU acceleration.

It is robust for tested targets, but not guaranteed for all Linux distros and GPU stacks.

## Future Options to Broaden Compatibility

1. Dual artifacts:
   - `Ordning-portable-sw` (current profile, safest default)
   - `Ordning-gpu` (keeps GPU libs/features for performance-focused users)
2. Add startup diagnostics mode:
   - env + GL/EGL loader traces in a log file for faster field debugging
3. Expand CI/manual matrix:
   - Debian/Ubuntu LTS, Fedora, Arch variants
4. Optional env toggle docs for advanced users:
   - allow opting into GPU path explicitly (unsupported by default)
