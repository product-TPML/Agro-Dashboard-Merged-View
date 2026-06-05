const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_FILE = path.join(ROOT_DIR, "karnataka.geojson");
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
  const geojson = readGeoJson();
  const features = normalizeFeatures(geojson.features || []);
  if (!features.length) {
    throw new Error("No features found in karnataka.geojson");
  }

  const bounds = getBounds(features);
  const projection = createProjection(bounds);
  const svgHeight = Math.round((bounds.height * projection.scale) + PADDING * 2);
  const sortedFeatures = features.slice().sort((a, b) => a.district.localeCompare(b.district));

  const svg = buildSvg(sortedFeatures, projection, svgHeight);
  fs.writeFileSync(OUTPUT_FILE, svg, "utf8");

  console.log(JSON.stringify({
    sourceFile: SOURCE_FILE,
    outputFile: OUTPUT_FILE,
    featureCount: sortedFeatures.length,
    districts: sortedFeatures.map((feature) => feature.district),
    bbox: bounds,
  }, null, 2));
}

function readGeoJson() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`GeoJSON not found: ${SOURCE_FILE}`);
  }

  return JSON.parse(fs.readFileSync(SOURCE_FILE, "utf8"));
}

function normalizeFeatures(features) {
  return features
    .filter((feature) => feature?.geometry?.coordinates?.length)
    .map((feature) => ({
      district: feature.properties?.district || "Unknown",
      geometry: feature.geometry,
      slug: slugify(feature.properties?.district || "unknown"),
    }));
}

function getBounds(features) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const feature of features) {
    visitCoordinates(feature.geometry, ([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    });
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
    const pathData = geometryToPath(feature.geometry, projection.project);
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
    "  <desc id=\"desc\">District-only Karnataka map generated from GeoJSON. Each district is a separate shape with its own fill color and district boundary.</desc>",
    "  <rect width=\"100%\" height=\"100%\" fill=\"#fffdf9\"/>",
    "  <g id=\"districts\">",
    paths.join("\n"),
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

function geometryToPath(geometry, project) {
  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates, project);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => polygonToPath(polygon, project)).join(" ");
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function polygonToPath(polygon, project) {
  return polygon.map((ring) => ringToPath(ring, project)).join(" ");
}

function ringToPath(ring, project) {
  const commands = [];

  for (let index = 0; index < ring.length; index += 1) {
    const point = ring[index];
    const [x, y] = project(point);
    commands.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
  }

  commands.push("Z");
  return commands.join(" ");
}

function visitCoordinates(geometry, visitor) {
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const point of ring) {
        visitor(point);
      }
    }
    return;
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const point of ring) {
          visitor(point);
        }
      }
    }
    return;
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
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
