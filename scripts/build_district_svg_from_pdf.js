const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_IMAGE = path.join(ROOT_DIR, "temp", "district-pdf.png", "page_1_screenshot.png");
const OUTPUT_FILE = path.join(ROOT_DIR, "local-dashboard", "public", "karnataka_districts_clean.svg");

const WHITE_THRESHOLD = 24;
const DARK_THRESHOLD = 150;
const CHROMA_THRESHOLD = 12;
const OUTSIDE_WHITE_THRESHOLD = 38;
const BOUNDARY_COMPONENT_MIN = 500;
const DISTRICT_COMPONENT_MIN = 1200;
const CROP_MARGIN = 10;

async function main() {
  ensureSourceExists();

  const image = await loadImage(SOURCE_IMAGE);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);

  const fullImage = context.getImageData(0, 0, image.width, image.height);
  const crop = findMapCrop(fullImage, image.width, image.height);
  const croppedImage = context.getImageData(crop.x, crop.y, crop.width, crop.height);

  const width = crop.width;
  const height = crop.height;
  const pixels = buildPixels(croppedImage.data, width, height);

  const boundaryMask = buildBoundaryMask(pixels, width, height);
  const outsideMask = buildOutsideMask(pixels, width, height, boundaryMask);
  const colorField = buildInitialColorField(pixels, width, height, boundaryMask, outsideMask);
  propagateInteriorColors(colorField, width, height, boundaryMask, outsideMask);

  const districts = extractDistrictComponents(colorField, width, height, boundaryMask, outsideMask);
  if (districts.length < 20) {
    throw new Error(`District extraction produced only ${districts.length} regions; expected roughly 31.`);
  }

  const svg = buildSvg(width, height, districts);
  fs.writeFileSync(OUTPUT_FILE, svg, "utf8");

  console.log(JSON.stringify({
    sourceImage: SOURCE_IMAGE,
    outputFile: OUTPUT_FILE,
    crop,
    districtCount: districts.length,
  }, null, 2));
}

function ensureSourceExists() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    throw new Error(`Rendered PDF image not found: ${SOURCE_IMAGE}`);
  }
}

function buildPixels(data, width, height) {
  const pixels = new Array(width * height);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    pixels[index] = {
      r: data[offset],
      g: data[offset + 1],
      b: data[offset + 2],
      a: data[offset + 3],
    };
  }
  return pixels;
}

function findMapCrop(imageData, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = getPixel(imageData.data, width, x, y);
      if (!isPotentialDistrictFill(pixel)) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    x: Math.max(0, minX - CROP_MARGIN),
    y: Math.max(0, minY - CROP_MARGIN),
    width: Math.min(width - Math.max(0, minX - CROP_MARGIN), (maxX - minX) + (CROP_MARGIN * 2)),
    height: Math.min(height - Math.max(0, minY - CROP_MARGIN), (maxY - minY) + (CROP_MARGIN * 2)),
  };
}

function getPixel(data, width, x, y) {
  const offset = ((y * width) + x) * 4;
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
    a: data[offset + 3],
  };
}

function buildBoundaryMask(pixels, width, height) {
  const darkMask = pixels.map((pixel) => isDarkPixel(pixel));
  const components = findBooleanComponents(darkMask, width, height);
  const boundaryMask = new Array(width * height).fill(false);

  for (const component of components) {
    if (component.size < BOUNDARY_COMPONENT_MIN) {
      continue;
    }
    for (const index of component.indices) {
      boundaryMask[index] = true;
    }
  }

  return dilateMask(boundaryMask, width, height, 1);
}

function buildOutsideMask(pixels, width, height, boundaryMask) {
  const outsideMask = new Array(width * height).fill(false);
  const queue = [];

  for (let x = 0; x < width; x += 1) {
    seedOutside(queue, outsideMask, pixels, width, height, boundaryMask, x, 0);
    seedOutside(queue, outsideMask, pixels, width, height, boundaryMask, x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    seedOutside(queue, outsideMask, pixels, width, height, boundaryMask, 0, y);
    seedOutside(queue, outsideMask, pixels, width, height, boundaryMask, width - 1, y);
  }

  while (queue.length) {
    const index = queue.shift();
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [nextX, nextY] of getNeighbors4(x, y, width, height)) {
      const nextIndex = (nextY * width) + nextX;
      if (outsideMask[nextIndex] || boundaryMask[nextIndex]) {
        continue;
      }
      if (!isOutsideBackground(pixels[nextIndex])) {
        continue;
      }
      outsideMask[nextIndex] = true;
      queue.push(nextIndex);
    }
  }

  return outsideMask;
}

function dilateMask(mask, width, height, radius) {
  const expanded = mask.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      if (!mask[index]) {
        continue;
      }
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }
          expanded[(nextY * width) + nextX] = true;
        }
      }
    }
  }
  return expanded;
}

function seedOutside(queue, outsideMask, pixels, width, height, boundaryMask, x, y) {
  const index = (y * width) + x;
  if (outsideMask[index] || boundaryMask[index]) {
    return;
  }
  if (!isOutsideBackground(pixels[index])) {
    return;
  }
  outsideMask[index] = true;
  queue.push(index);
}

function buildInitialColorField(pixels, width, height, boundaryMask, outsideMask) {
  const field = new Array(width * height).fill(null);

  for (let index = 0; index < pixels.length; index += 1) {
    if (boundaryMask[index] || outsideMask[index]) {
      continue;
    }
    if (isColorSeed(pixels[index])) {
      field[index] = pixels[index];
    }
  }

  return field;
}

function propagateInteriorColors(field, width, height, boundaryMask, outsideMask) {
  let changed = true;
  let passes = 0;

  while (changed && passes < 120) {
    changed = false;
    passes += 1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width) + x;
        if (field[index] || boundaryMask[index] || outsideMask[index]) {
          continue;
        }

        const neighborColors = [];
        for (const [nextX, nextY] of getNeighbors8(x, y, width, height)) {
          const nextIndex = (nextY * width) + nextX;
          if (field[nextIndex]) {
            neighborColors.push(field[nextIndex]);
          }
        }

        if (neighborColors.length < 2) {
          continue;
        }

        field[index] = averageColor(neighborColors);
        changed = true;
      }
    }
  }
}

function extractDistrictComponents(field, width, height, boundaryMask, outsideMask) {
  const visited = new Array(width * height).fill(false);
  const districts = [];

  for (let index = 0; index < field.length; index += 1) {
    if (visited[index] || boundaryMask[index] || outsideMask[index] || !field[index]) {
      continue;
    }

    const indices = [];
    const queue = [index];
    visited[index] = true;

    while (queue.length) {
      const current = queue.shift();
      indices.push(current);
      const x = current % width;
      const y = Math.floor(current / width);

      for (const [nextX, nextY] of getNeighbors4(x, y, width, height)) {
        const nextIndex = (nextY * width) + nextX;
        if (visited[nextIndex] || boundaryMask[nextIndex] || outsideMask[nextIndex] || !field[nextIndex]) {
          continue;
        }
        visited[nextIndex] = true;
        queue.push(nextIndex);
      }
    }

    if (indices.length < DISTRICT_COMPONENT_MIN) {
      continue;
    }

    const color = averageColor(indices.map((componentIndex) => field[componentIndex]));
    const path = traceComponentPath(indices, width);
    const centroid = getCentroid(indices, width);

    districts.push({
      id: `district-${String(districts.length + 1).padStart(2, "0")}`,
      color,
      path,
      centroid,
      size: indices.length,
    });
  }

  return districts.sort((left, right) => {
    if (Math.abs(left.centroid.y - right.centroid.y) > 14) {
      return left.centroid.y - right.centroid.y;
    }
    return left.centroid.x - right.centroid.x;
  }).map((district, index) => ({
    ...district,
    id: `district-${String(index + 1).padStart(2, "0")}`,
  }));
}

function traceComponentPath(indices, width) {
  const filled = new Set(indices);
  const edges = new Map();

  for (const index of indices) {
    const x = index % width;
    const y = Math.floor(index / width);

    addBoundaryEdgeIfNeeded(filled, width, edges, x, y, x, y, x + 1, y, x, y - 1);
    addBoundaryEdgeIfNeeded(filled, width, edges, x, y, x + 1, y, x + 1, y + 1, x + 1, y);
    addBoundaryEdgeIfNeeded(filled, width, edges, x, y, x + 1, y + 1, x, y + 1, x, y + 1);
    addBoundaryEdgeIfNeeded(filled, width, edges, x, y, x, y + 1, x, y, x - 1, y);
  }

  const points = chainEdges(edges);
  const simplified = simplifyOrthogonalPath(points);
  return simplified.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
}

function addBoundaryEdgeIfNeeded(filled, width, edges, x, y, x1, y1, x2, y2, neighborX, neighborY) {
  if (neighborX >= 0 && neighborY >= 0) {
    const neighborIndex = (neighborY * width) + neighborX;
    if (filled.has(neighborIndex)) {
      return;
    }
  }

  const startKey = `${x1},${y1}`;
  const endKey = `${x2},${y2}`;
  edges.set(startKey, endKey);
}

function chainEdges(edges) {
  const [startKey] = edges.keys();
  if (!startKey) {
    return [];
  }

  const points = [];
  let currentKey = startKey;
  const seen = new Set();

  while (!seen.has(currentKey) && edges.has(currentKey)) {
    seen.add(currentKey);
    points.push(parsePoint(currentKey));
    currentKey = edges.get(currentKey);
  }

  return points;
}

function simplifyOrthogonalPath(points) {
  if (points.length < 3) {
    return points;
  }

  const simplified = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const sameX = previous[0] === current[0] && current[0] === next[0];
    const sameY = previous[1] === current[1] && current[1] === next[1];
    if (sameX || sameY) {
      continue;
    }
    simplified.push(current);
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

function parsePoint(value) {
  const [x, y] = value.split(",").map(Number);
  return [x, y];
}

function getCentroid(indices, width) {
  let sumX = 0;
  let sumY = 0;
  for (const index of indices) {
    sumX += index % width;
    sumY += Math.floor(index / width);
  }
  return {
    x: sumX / indices.length,
    y: sumY / indices.length,
  };
}

function averageColor(colors) {
  const total = colors.reduce((accumulator, color) => {
    accumulator.r += color.r;
    accumulator.g += color.g;
    accumulator.b += color.b;
    return accumulator;
  }, { r: 0, g: 0, b: 0 });

  return {
    r: Math.round(total.r / colors.length),
    g: Math.round(total.g / colors.length),
    b: Math.round(total.b / colors.length),
  };
}

function buildSvg(width, height, districts) {
  const paths = districts.map((district) => {
    return `  <path id="${district.id}" fill="${toHex(district.color)}" stroke="#111111" stroke-width="2" stroke-linejoin="round" d="${district.path}" />`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<rect width="${width}" height="${height}" fill="white" />
${paths}
</svg>
`;
}

function findBooleanComponents(mask, width, height) {
  const visited = new Array(mask.length).fill(false);
  const components = [];

  for (let index = 0; index < mask.length; index += 1) {
    if (visited[index] || !mask[index]) {
      continue;
    }

    const indices = [];
    const queue = [index];
    visited[index] = true;

    while (queue.length) {
      const current = queue.shift();
      indices.push(current);
      const x = current % width;
      const y = Math.floor(current / width);

      for (const [nextX, nextY] of getNeighbors4(x, y, width, height)) {
        const nextIndex = (nextY * width) + nextX;
        if (visited[nextIndex] || !mask[nextIndex]) {
          continue;
        }
        visited[nextIndex] = true;
        queue.push(nextIndex);
      }
    }

    components.push({
      size: indices.length,
      indices,
    });
  }

  return components.sort((left, right) => right.size - left.size);
}

function getNeighbors4(x, y, width, height) {
  const neighbors = [];
  if (x > 0) neighbors.push([x - 1, y]);
  if (x < width - 1) neighbors.push([x + 1, y]);
  if (y > 0) neighbors.push([x, y - 1]);
  if (y < height - 1) neighbors.push([x, y + 1]);
  return neighbors;
}

function getNeighbors8(x, y, width, height) {
  const neighbors = [];
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }
      neighbors.push([nextX, nextY]);
    }
  }
  return neighbors;
}

function isPotentialDistrictFill(pixel) {
  return !isNearWhite(pixel, WHITE_THRESHOLD) && !isDarkPixel(pixel);
}

function isColorSeed(pixel) {
  return !isNearWhite(pixel, WHITE_THRESHOLD) && !isDarkPixel(pixel) && getChroma(pixel) >= CHROMA_THRESHOLD;
}

function isOutsideBackground(pixel) {
  return isNearWhite(pixel, OUTSIDE_WHITE_THRESHOLD);
}

function isNearWhite(pixel, threshold) {
  return (255 - pixel.r) <= threshold && (255 - pixel.g) <= threshold && (255 - pixel.b) <= threshold;
}

function isDarkPixel(pixel) {
  return pixel.r < DARK_THRESHOLD && pixel.g < DARK_THRESHOLD && pixel.b < DARK_THRESHOLD;
}

function getChroma(pixel) {
  return Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
}

function toHex(color) {
  return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
