export const CURRENT_RENDER_CALIBRATION_VERSION = 2;
export const LEGACY_EXPOSURE_MIGRATION_FACTOR = 0.11;

export const migrateRenderExposure = (
  exposure: number,
  renderCalibrationVersion: number | undefined
) =>
  renderCalibrationVersion === undefined || renderCalibrationVersion === 1
    ? {
        exposure: exposure * LEGACY_EXPOSURE_MIGRATION_FACTOR,
        renderCalibrationVersion: CURRENT_RENDER_CALIBRATION_VERSION
      }
    : { exposure, renderCalibrationVersion };

export const CALIBRATION_CAMERA_EXPOSURE = 0.14;
export const DEMO_CAMERA_EXPOSURE = 0.19;
export const DEFAULT_CAMERA_EXPOSURE = 0.19;
export const FITTED_CAMERA_EXPOSURE_CAP = 0.1;
