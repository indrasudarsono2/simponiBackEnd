import sanitizeHtml from "sanitize-html";

const RICH_TEXT_KEYS = new Set([
  "answer", "content", "contentOfBriefing", "description", "question", "userAnswer",
]);

const clean = (value, key = "") => {
  if (Array.isArray(value)) return value.map((item) => clean(item));
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      value[childKey] = clean(childValue, childKey);
    }
    return value;
  }
  if (typeof value !== "string" || !RICH_TEXT_KEYS.has(key)) return value;
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "code", "pre", "a"],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true) },
  });
};

export const sanitizeRichText = (req, _res, next) => {
  if (req.body) clean(req.body);
  next();
};

export const sanitizeRichTextResponses = (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(clean(body));
  next();
};
