export const APP_NAME = "LDK Lighting Lab";

const configuredAppUrl = import.meta.env.VITE_APP_URL?.trim();

export const getAppDisplayUrl = () => {
  const source = configuredAppUrl || window.location.origin;
  return source.replace(/^https?:\/\//, "").replace(/\/$/, "");
};
