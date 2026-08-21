const parseCookies = (header = "") => Object.fromEntries(
  header
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf("=");
      const key = separator >= 0 ? item.slice(0, separator) : item;
      const value = separator >= 0 ? item.slice(separator + 1) : "";
      try {
        return [key, decodeURIComponent(value)];
      } catch {
        return [key, value];
      }
    }),
);

export { parseCookies };
