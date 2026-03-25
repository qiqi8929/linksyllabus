export const size = {
  width: 64,
  height: 64
};

export const contentType = "image/svg+xml";

export default function Icon() {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
  <rect width="${size.width}" height="${size.height}" rx="14" fill="#E8956D" />
  <circle cx="${size.width / 2}" cy="${size.height / 2}" r="12" fill="#FFFFFF" />
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}


