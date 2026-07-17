import {
  strFromU8,
  strToU8,
  unzip,
  zip,
  type AsyncZippable,
  type Unzipped,
} from "fflate";

const DRAWINGML_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/main";
const CHART_NAMESPACE = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NORMALIZED_ATTRIBUTES = ["b", "i"] as const;

// PPTX media can already be large. Keep normalization comfortably below the
// application's upload limit so decompression and repackaging do not exhaust
// browser memory. Files outside these limits continue through the existing
// LibreOffice conversion unchanged.
const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_CHART_XML_BYTES = 8 * 1024 * 1024;

type NormalizedAttribute = (typeof NORMALIZED_ATTRIBUTES)[number];

export type PptxNormalizationStats = {
  chartsScanned: number;
  chartsChanged: number;
  chartParseFailures: number;
  runsChanged: number;
  attributesApplied: Record<NormalizedAttribute, number>;
  expandedBytes: number;
};

export type PptxNormalizationResult = {
  file: File;
  changed: boolean;
  warnings: string[];
  stats: PptxNormalizationStats;
};

export type ChartXmlNormalizationResult = {
  xml: string;
  changed: boolean;
  runsChanged: number;
  attributesApplied: Record<NormalizedAttribute, number>;
};

type UnzipResult = {
  archive: Unzipped;
  expandedBytes: number;
  limitWarning: string | null;
};

function emptyStats(): PptxNormalizationStats {
  return {
    chartsScanned: 0,
    chartsChanged: 0,
    chartParseFailures: 0,
    runsChanged: 0,
    attributesApplied: { b: 0, i: 0 },
    expandedBytes: 0,
  };
}

function directChildInNamespace(
  parent: Element,
  namespace: string,
  localName: string
): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.namespaceURI === namespace && child.localName === localName) {
      return child;
    }
  }
  return null;
}

function directDrawingChild(parent: Element, localName: string): Element | null {
  return directChildInNamespace(parent, DRAWINGML_NAMESPACE, localName);
}

function isDrawingRun(element: Element): boolean {
  return (
    element.namespaceURI === DRAWINGML_NAMESPACE &&
    (element.localName === "r" || element.localName === "fld")
  );
}

function createRunProperties(
  document: XMLDocument,
  run: Element,
  defaultProperties: Element
): Element {
  const prefix =
    run.lookupPrefix(DRAWINGML_NAMESPACE) ||
    defaultProperties.prefix ||
    "a";
  const runProperties = document.createElementNS(
    DRAWINGML_NAMESPACE,
    `${prefix}:rPr`
  );
  run.insertBefore(runProperties, run.firstChild);
  return runProperties;
}

function hasParserError(document: XMLDocument): boolean {
  return (
    document.getElementsByTagName("parsererror").length > 0 ||
    document.getElementsByTagNameNS("*", "parsererror").length > 0
  );
}

function defaultPropertiesFromTextProperties(
  textProperties: Element | null
): Element | null {
  if (!textProperties) return null;

  for (const child of Array.from(textProperties.children)) {
    if (child.namespaceURI !== DRAWINGML_NAMESPACE || child.localName !== "p") {
      continue;
    }
    const paragraphProperties = directDrawingChild(child, "pPr");
    const defaultProperties = paragraphProperties
      ? directDrawingChild(paragraphProperties, "defRPr")
      : null;
    if (defaultProperties) return defaultProperties;
  }
  return null;
}

function chartLabelDefaultProperties(paragraph: Element): Element[] {
  const richText = paragraph.parentElement;
  const text =
    richText?.namespaceURI === CHART_NAMESPACE && richText.localName === "rich"
      ? richText.parentElement
      : null;
  const dataLabel =
    text?.namespaceURI === CHART_NAMESPACE && text.localName === "tx"
      ? text.parentElement
      : null;
  if (
    !dataLabel ||
    dataLabel.namespaceURI !== CHART_NAMESPACE ||
    dataLabel.localName !== "dLbl"
  ) {
    return [];
  }

  const properties: Element[] = [];
  const labelTextProperties = directChildInNamespace(
    dataLabel,
    CHART_NAMESPACE,
    "txPr"
  );
  const labelDefaults = defaultPropertiesFromTextProperties(labelTextProperties);
  if (labelDefaults) properties.push(labelDefaults);

  const dataLabels = dataLabel.parentElement;
  if (
    dataLabels?.namespaceURI === CHART_NAMESPACE &&
    dataLabels.localName === "dLbls"
  ) {
    const groupTextProperties = directChildInNamespace(
      dataLabels,
      CHART_NAMESPACE,
      "txPr"
    );
    const groupDefaults =
      defaultPropertiesFromTextProperties(groupTextProperties);
    if (groupDefaults) properties.push(groupDefaults);
  }

  return properties;
}

export function normalizeChartXmlForLibreOffice(
  xml: string
): ChartXmlNormalizationResult {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (hasParserError(document)) {
    throw new Error("Invalid chart XML.");
  }

  const attributesApplied: Record<NormalizedAttribute, number> = { b: 0, i: 0 };
  let runsChanged = 0;

  for (const paragraph of Array.from(
    document.getElementsByTagNameNS(DRAWINGML_NAMESPACE, "p")
  )) {
    const paragraphProperties = directDrawingChild(paragraph, "pPr");
    const paragraphDefaults = paragraphProperties
      ? directDrawingChild(paragraphProperties, "defRPr")
      : null;
    const defaultProperties = [
      ...(paragraphDefaults ? [paragraphDefaults] : []),
      ...chartLabelDefaultProperties(paragraph),
    ];
    if (defaultProperties.length === 0) continue;

    for (const run of Array.from(paragraph.children).filter(isDrawingRun)) {
      let runProperties = directDrawingChild(run, "rPr");
      let runChanged = false;

      for (const attribute of NORMALIZED_ATTRIBUTES) {
        if (runProperties?.hasAttribute(attribute)) continue;
        const inheritedProperties = defaultProperties.find((properties) =>
          properties.hasAttribute(attribute)
        );
        if (!inheritedProperties) continue;

        if (!runProperties) {
          runProperties = createRunProperties(
            document,
            run,
            inheritedProperties
          );
        }
        runProperties.setAttribute(
          attribute,
          inheritedProperties.getAttribute(attribute) || ""
        );
        attributesApplied[attribute] += 1;
        runChanged = true;
      }

      if (runChanged) runsChanged += 1;
    }
  }

  if (runsChanged === 0) {
    return {
      xml,
      changed: false,
      runsChanged,
      attributesApplied,
    };
  }

  return {
    xml: new XMLSerializer().serializeToString(document),
    changed: true,
    runsChanged,
    attributesApplied,
  };
}

function unzipArchive(bytes: Uint8Array): Promise<UnzipResult> {
  return new Promise((resolve, reject) => {
    let expandedBytes = 0;
    let entryCount = 0;
    let limitWarning: string | null = null;

    unzip(
      bytes,
      {
        filter(file) {
          entryCount += 1;
          if (entryCount > MAX_ARCHIVE_ENTRIES) {
            limitWarning ||= "normalization-skipped:too-many-archive-entries";
            return false;
          }
          if (expandedBytes + file.originalSize > MAX_EXPANDED_BYTES) {
            limitWarning ||= "normalization-skipped:expanded-package-too-large";
            return false;
          }
          if (limitWarning) return false;

          expandedBytes += file.originalSize;
          return true;
        },
      },
      (error, archive) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ archive, expandedBytes, limitWarning });
      }
    );
  });
}

function zipArchive(archive: AsyncZippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(archive, { level: 6 }, (error, bytes) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(bytes);
    });
  });
}

function isSignedPackage(paths: string[]): boolean {
  return paths.some((path) => {
    const normalizedPath = path.toLowerCase().replace(/^\/+/, "");
    return (
      normalizedPath.startsWith("_xmlsignatures/") ||
      normalizedPath.includes("/_xmlsignatures/") ||
      normalizedPath.endsWith("origin.sigs.rels")
    );
  });
}

function isChartXml(path: string): boolean {
  return /^ppt\/charts\/chart[^/]*\.xml$/i.test(path);
}

function toFileBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function normalizePptxForLibreOffice(
  file: File
): Promise<PptxNormalizationResult> {
  const stats = emptyStats();
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension !== "pptx") {
    return { file, changed: false, warnings: [], stats };
  }

  if (file.size > MAX_COMPRESSED_BYTES) {
    return {
      file,
      changed: false,
      warnings: ["normalization-skipped:compressed-package-too-large"],
      stats,
    };
  }

  const inputBytes = new Uint8Array(await file.arrayBuffer());
  const { archive, expandedBytes, limitWarning } = await unzipArchive(inputBytes);
  stats.expandedBytes = expandedBytes;

  if (limitWarning) {
    return { file, changed: false, warnings: [limitWarning], stats };
  }

  const paths = Object.keys(archive);
  if (!archive["[Content_Types].xml"] || !archive["ppt/presentation.xml"]) {
    return {
      file,
      changed: false,
      warnings: ["normalization-skipped:not-a-pptx-package"],
      stats,
    };
  }

  if (isSignedPackage(paths)) {
    return {
      file,
      changed: false,
      warnings: ["normalization-skipped:digital-signature"],
      stats,
    };
  }

  const warnings: string[] = [];
  for (const chartPath of paths.filter(isChartXml).sort()) {
    stats.chartsScanned += 1;
    const chartBytes = archive[chartPath];
    if (!chartBytes) continue;
    if (chartBytes.byteLength > MAX_CHART_XML_BYTES) {
      warnings.push("chart-skipped:xml-too-large");
      continue;
    }

    try {
      const result = normalizeChartXmlForLibreOffice(strFromU8(chartBytes));
      if (!result.changed) continue;

      archive[chartPath] = strToU8(result.xml);
      stats.chartsChanged += 1;
      stats.runsChanged += result.runsChanged;
      stats.attributesApplied.b += result.attributesApplied.b;
      stats.attributesApplied.i += result.attributesApplied.i;
    } catch {
      stats.chartParseFailures += 1;
      warnings.push("chart-skipped:xml-parse-failed");
    }
  }

  if (stats.chartsChanged === 0) {
    return { file, changed: false, warnings, stats };
  }

  const outputBytes = await zipArchive(archive);
  const normalizedFile = new File([toFileBytes(outputBytes)], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });

  return {
    file: normalizedFile,
    changed: true,
    warnings,
    stats,
  };
}
