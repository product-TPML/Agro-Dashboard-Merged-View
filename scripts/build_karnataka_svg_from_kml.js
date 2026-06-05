const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_FILE = path.join(ROOT_DIR, "temp", "district_doc.kml");
const OUTPUT_FILE = path.join(ROOT_DIR, "local-dashboard", "public", "Karnataka_map_svg_new.svg");
const SVG_WIDTH = 1200;
const PADDING = 36;

const DISTRICT_COLORS = [
  "#f7d7c4",
  "#e7c9f4",
  "#c8def8",
  "#d4f0d0",
  "#f9e6a8",
  "#f4c7c3",
  "#d7d0f8",
  "#c8ebe6",
  "#f1d6b8",
  "#d9e7b6",
  "#f6cfe1",
  "#cfe2f3",
  "#ead1dc",
  "#d0e0e3",
  "#fff2cc",
  "#d9d2e9",
  "#fce5cd",
  "#d5ead7",
  "#c9daf8",
  "#ead9c7",
  "#f4cccc",
  "#d9ead3",
  "#cfe2f3",
  "#ead1dc",
  "#f9cb9c",
  "#cfe7d5",
  "#d0d9f2",
  "#fff0b3",
  "#d8c6f2",
  "#c7e8f7",
  "#f1d4af",
];

function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Extracted KML not found: ${SOURCE_FILE}`);
  }

  const kml = fs.readFileSync(SOURCE_FILE, "utf8");
  const features = parsePlacemarks(kml);
  if (!features.length) {
    throw new Error("No district placemarks found in extracted KML.");
  }

  const bounds = getBounds(features);
  const projection = createProjection(bounds);
  const svgHeight = Math.round((bounds.height * projection.scale) + PADDING * 2);

  const svg = buildSvg(features, projection, svgHeight);
  fs.writeFileSync(OUTPUT_FILE, svg, "utf8");

  console.log(JSON.stringify({
    sourceFile: SOURCE_FILE,
    outputFile: OUTPUT_FILE,
    featureCount: features.length,
    districts: features.map((feature) => feature.district),
  }, null, 2));
}

function parsePlacemarks(kml) {
  const placemarkMatches = [...kml.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/g)];

  return placemarkMatches
    .map((match) => parsePlacemark(match[0]))
    .filter(Boolean)
    .sort((left, right) => left.district.localeCompare(right.district));
}

function parsePlacemark(xml) {
  const nameMatch = xml.match(/<name>([^<]+)<\/name>/);
  if (!nameMatch) {
    return null;
  }

  const district = nameMatch[1].trim();
  if (district === "District") {
    return null;
  }

  const polygonMatches = [...xml.matchAll(/<Polygon\b[\s\S]*?<\/Polygon>/g)];
  const polygons = polygonMatches
    .map((polygonMatch) => parsePolygon(polygonMatch[0]))
    .filter((polygon) => polygon.length > 0);

  if (!polygons.length) {
    return null;
  }

  return {
    district,
    slug: slugify(district),
    polygons,
  };
}

function parsePolygon(xml) {
  const ringMatches = [...xml.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)];
  return ringMatches
    .map((match) => parseRing(match[1]))
    .filter((ring) => ring.length >= 4);
}

function parseRing(coordinatesText) {
  return coordinatesText
    .trim()
    .split(/\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [lonText, latText] = chunk.split(",");
      return [Number(lonText), Number(latText)];
    })
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function getBounds(features) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    for (const polygon of feature.polygons) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          minLon = Math.min(minLon, lon);
          minLat = Math.min(minLat, lat);
          maxLon = Math.max(maxLon, lon);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }
  }

  return {
    minLon,
    minLat,
    maxLon,
    maxLat,
    width: maxLon - minLon,
    height: maxLat - minLat,
  };
}

function createProjection(bounds) {
  const scale = (SVG_WIDTH - PADDING * 2) / bounds.width;
  return {
    scale,
    project([lon, lat]) {
      const x = ((lon - bounds.minLon) * scale) + PADDING;
      const y = ((bounds.maxLat - lat) * scale) + PADDING;
      return [round(x), round(y)];
    },
  };
}

function buildSvg(features, projection, svgHeight) {
  const paths = features.map((feature, index) => {
    const fill = DISTRICT_COLORS[index % DISTRICT_COLORS.length];
    const pathData = feature.polygons.map((polygon) => polygonToPath(polygon, projection.project)).join(" ");
    return [
      `  <path id="${feature.slug}"`,
      `        data-district="${escapeHtml(feature.district)}"`,
      `        fill="${fill}"`,
      `        stroke="#3d2f3b"`,
      `        stroke-width="2.6"`,
      `        stroke-linejoin="round"`,
      `        stroke-linecap="round"`,
      `        fill-rule="evenodd"`,
      `        d="${pathData}">`,
      `    <title>${escapeHtml(feature.district)}</title>`,
      "  </path>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${svgHeight}" viewBox="0 0 ${SVG_WIDTH} ${svgHeight}" role="img" aria-labelledby="title desc">`,
    "  <title id=\"title\">Karnataka District Map</title>",
    "  <desc id=\"desc\">District-only Karnataka map generated from KML placemark polygons. Each district is a separate shape with its own fill color and district boundary.</desc>",
    "  <rect width=\"100%\" height=\"100%\" fill=\"#fffdf9\"/>",
    "  <g id=\"districts\">",
    paths.join("\n"),
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

function polygonToPath(polygon, project) {
  return polygon.map((ring) => ringToPath(ring, project)).join(" ");
}

function ringToPath(ring, project) {
  const commands = [];

  for (let index = 0; index < ring.length; index += 1) {
    const [x, y] = project(ring[index]);
    commands.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
  }

  commands.push("Z");
  return commands.join(" ");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function round(value) {
  return Number(value.toFixed(2));
}

main();
