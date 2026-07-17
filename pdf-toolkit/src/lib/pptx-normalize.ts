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
const BAR_CATEGORY_WRAP_COLUMNS = 30;
const MAX_BAR_CATEGORY_LABEL_LENGTH = BAR_CATEGORY_WRAP_COLUMNS * 2;
const MIN_LARGE_DATA_LABEL_FONT_SIZE = 3_000;
const MIN_LARGE_CATEGORY_LABEL_FONT_SIZE = 1_800;

type NormalizedAttribute = (typeof NORMALIZED_ATTRIBUTES)[number];

export type PptxNormalizationStats = {
  chartsScanned: number;
  chartsChanged: number;
  chartParseFailures: number;
  runsChanged: number;
  attributesApplied: Record<NormalizedAttribute, number>;
  zeroMinimumAxesApplied: number;
  categoryLabelsWrapped: number;
  dataLabelPositionsAdjusted: number;
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
  zeroMinimumAxesApplied: number;
  categoryLabelsWrapped: number;
  dataLabelPositionsAdjusted: number;
};

type UnzipResult = {
  archive: Unzipped;
  expandedBytes: number;
  limitWarning: string | null;
};

type BarLayoutAdjustmentStats = {
  categoryLabelsWrapped: number;
  dataLabelPositionsAdjusted: number;
};

function emptyStats(): PptxNormalizationStats {
  return {
    chartsScanned: 0,
    chartsChanged: 0,
    chartParseFailures: 0,
    runsChanged: 0,
    attributesApplied: { b: 0, i: 0 },
    zeroMinimumAxesApplied: 0,
    categoryLabelsWrapped: 0,
    dataLabelPositionsAdjusted: 0,
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

function directChartChild(parent: Element, localName: string): Element | null {
  return directChildInNamespace(parent, CHART_NAMESPACE, localName);
}

function directChartChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter(
    (child) =>
      child.namespaceURI === CHART_NAMESPACE && child.localName === localName
  );
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

function numericBarChartValues(barChart: Element): number[] | null {
  const values: number[] = [];

  for (const series of directChartChildren(barChart, "ser")) {
    const valueContainer = directChartChild(series, "val");
    if (!valueContainer) return null;

    for (const valueElement of Array.from(
      valueContainer.getElementsByTagNameNS(CHART_NAMESPACE, "v")
    )) {
      const rawValue = valueElement.textContent?.trim() || "";
      if (!rawValue) continue;

      const value = Number(rawValue);
      if (!Number.isFinite(value)) return null;
      values.push(value);
    }
  }

  return values.length > 0 ? values : null;
}

function applyZeroMinimumToPositiveBarAxes(document: XMLDocument): number {
  let axesChanged = 0;

  for (const plotArea of Array.from(
    document.getElementsByTagNameNS(CHART_NAMESPACE, "plotArea")
  )) {
    const chartGroups = Array.from(plotArea.children).filter(
      (child) =>
        child.namespaceURI === CHART_NAMESPACE &&
        child.localName.endsWith("Chart")
    );

    for (const valueAxis of directChartChildren(plotArea, "valAx")) {
      const axisId = directChartChild(valueAxis, "axId")?.getAttribute("val");
      if (!axisId) continue;

      const axisChartGroups = chartGroups.filter((chartGroup) =>
        directChartChildren(chartGroup, "axId").some(
          (chartAxisId) => chartAxisId.getAttribute("val") === axisId
        )
      );
      if (
        axisChartGroups.length === 0 ||
        axisChartGroups.some((chartGroup) => chartGroup.localName !== "barChart")
      ) {
        continue;
      }

      const valueSets = axisChartGroups.map(numericBarChartValues);
      if (valueSets.some((values) => values === null)) continue;

      const values = valueSets.flatMap((axisValues) => axisValues || []);
      if (
        values.length === 0 ||
        values.some((value) => value < 0)
      ) {
        continue;
      }

      const scaling = directChartChild(valueAxis, "scaling");
      if (!scaling || directChartChild(scaling, "min")) continue;
      if (directChartChild(scaling, "logBase")) continue;

      const orientation =
        directChartChild(scaling, "orientation")?.getAttribute("val");
      if (orientation && orientation !== "minMax") continue;

      const maximum = directChartChild(scaling, "max");
      const maximumValue = Number(maximum?.getAttribute("val"));
      if (
        !maximum ||
        !Number.isFinite(maximumValue) ||
        maximumValue <= 0 ||
        values.some((value) => value > maximumValue)
      ) {
        continue;
      }

      const prefix =
        scaling.lookupPrefix(CHART_NAMESPACE) || valueAxis.prefix || "c";
      const minimum = document.createElementNS(
        CHART_NAMESPACE,
        `${prefix}:min`
      );
      minimum.setAttribute("val", "0");
      scaling.insertBefore(minimum, maximum.nextSibling);
      axesChanged += 1;
    }
  }

  return axesChanged;
}

function directTextPropertyFontSize(
  parent: Element,
  propertyName: string
): number | null {
  const properties = defaultPropertiesFromTextProperties(
    directChartChild(parent, propertyName)
  );
  const size = Number(properties?.getAttribute("sz"));
  return Number.isFinite(size) && size > 0 ? size : null;
}

function wrapBarCategoryLabel(value: string): string | null {
  if (
    value.length <= BAR_CATEGORY_WRAP_COLUMNS ||
    value.length > MAX_BAR_CATEGORY_LABEL_LENGTH ||
    value !== value.trim() ||
    /[\r\n\t]|\s{2,}/u.test(value)
  ) {
    return null;
  }

  const words = value.split(" ");
  if (
    words.length < 2 ||
    words.some((word) => word.length > BAR_CATEGORY_WRAP_COLUMNS)
  ) {
    return null;
  }

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= BAR_CATEGORY_WRAP_COLUMNS) {
      line = candidate;
      continue;
    }
    if (!line) return null;
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);

  return lines.length === 2 ? lines.join("\n") : null;
}

function dataLabelGroups(barChart: Element, series: Element[]): Element[] {
  return [
    ...series
      .map((entry) => directChartChild(entry, "dLbls"))
      .filter((entry): entry is Element => Boolean(entry)),
    ...directChartChildren(barChart, "dLbls"),
  ];
}

function applyPositiveBarLayoutCompatibility(
  document: XMLDocument
): BarLayoutAdjustmentStats {
  const stats: BarLayoutAdjustmentStats = {
    categoryLabelsWrapped: 0,
    dataLabelPositionsAdjusted: 0,
  };

  for (const plotArea of Array.from(
    document.getElementsByTagNameNS(CHART_NAMESPACE, "plotArea")
  )) {
    const chartGroups = Array.from(plotArea.children).filter(
      (child) =>
        child.namespaceURI === CHART_NAMESPACE &&
        child.localName.endsWith("Chart")
    );
    if (chartGroups.length !== 1 || chartGroups[0].localName !== "barChart") {
      continue;
    }

    const barChart = chartGroups[0];
    if (
      directChartChild(barChart, "barDir")?.getAttribute("val") !== "bar" ||
      directChartChild(barChart, "grouping")?.getAttribute("val") !==
        "clustered"
    ) {
      continue;
    }

    const plotLayout = directChartChild(plotArea, "layout");
    if (!plotLayout || plotLayout.children.length > 0) continue;

    const series = directChartChildren(barChart, "ser");
    if (series.length !== 1) continue;

    const values = numericBarChartValues(barChart);
    if (
      !values ||
      values.length < 2 ||
      values.some((value) => value < 0)
    ) {
      continue;
    }

    const axisIds = new Set(
      directChartChildren(barChart, "axId")
        .map((axisId) => axisId.getAttribute("val"))
        .filter((axisId): axisId is string => Boolean(axisId))
    );
    const valueAxis = directChartChildren(plotArea, "valAx").find((axis) =>
      axisIds.has(directChartChild(axis, "axId")?.getAttribute("val") || "")
    );
    const categoryAxis = directChartChildren(plotArea, "catAx").find((axis) =>
      axisIds.has(directChartChild(axis, "axId")?.getAttribute("val") || "")
    );
    if (!valueAxis || !categoryAxis) continue;

    const scaling = directChartChild(valueAxis, "scaling");
    const minimumValue = Number(
      directChartChild(scaling || valueAxis, "min")?.getAttribute("val")
    );
    const maximumValue = Number(
      directChartChild(scaling || valueAxis, "max")?.getAttribute("val")
    );
    if (
      !scaling ||
      directChartChild(scaling, "logBase") ||
      minimumValue !== 0 ||
      !Number.isFinite(maximumValue) ||
      maximumValue <= 0 ||
      values.some((value) => value > maximumValue)
    ) {
      continue;
    }

    const categoryFontSize = directTextPropertyFontSize(categoryAxis, "txPr");
    if (
      categoryFontSize === null ||
      categoryFontSize < MIN_LARGE_CATEGORY_LABEL_FONT_SIZE
    ) {
      continue;
    }

    const labels = dataLabelGroups(barChart, series);
    if (
      labels.length === 0 ||
      labels.some(
        (group) =>
          directChartChildren(group, "dLbl").length > 0 ||
          directChartChild(group, "layout")
      )
    ) {
      continue;
    }

    const positionedLabels = labels.filter(
      (group) =>
        directChartChild(group, "dLblPos")?.getAttribute("val") === "outEnd" &&
        directChartChild(group, "showVal")?.getAttribute("val") === "1"
    );
    if (positionedLabels.length === 0) continue;

    const largeLabelFont = positionedLabels
      .map((group) => directTextPropertyFontSize(group, "txPr"))
      .find((size) => size !== null);
    if (
      largeLabelFont === undefined ||
      largeLabelFont === null ||
      largeLabelFont < MIN_LARGE_DATA_LABEL_FONT_SIZE
    ) {
      continue;
    }

    const category = directChartChild(series[0], "cat");
    const stringReference = category
      ? directChartChild(category, "strRef")
      : null;
    const stringCache = stringReference
      ? directChartChild(stringReference, "strCache")
      : null;
    if (!stringCache) continue;

    const labelValues = directChartChildren(stringCache, "pt")
      .map((point) => directChartChild(point, "v"))
      .filter((value): value is Element => Boolean(value));
    if (
      labelValues.length !== values.length ||
      labelValues.some((value) => /[\r\n\t]/u.test(value.textContent || ""))
    ) {
      continue;
    }

    const wrappedLabels = labelValues.map((value) =>
      wrapBarCategoryLabel(value.textContent || "")
    );
    if (wrappedLabels.some((value) => value === null)) continue;

    for (let index = 0; index < labelValues.length; index += 1) {
      const wrapped = wrappedLabels[index];
      if (!wrapped) continue;
      labelValues[index].textContent = wrapped;
      stats.categoryLabelsWrapped += 1;
    }

    for (const group of labels) {
      const position = directChartChild(group, "dLblPos");
      if (position?.getAttribute("val") !== "outEnd") continue;
      position.setAttribute("val", "inEnd");
      stats.dataLabelPositionsAdjusted += 1;
    }
  }

  return stats;
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
  const zeroMinimumAxesApplied = applyZeroMinimumToPositiveBarAxes(document);
  const barLayoutAdjustments =
    applyPositiveBarLayoutCompatibility(document);

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

  if (
    runsChanged === 0 &&
    zeroMinimumAxesApplied === 0 &&
    barLayoutAdjustments.categoryLabelsWrapped === 0 &&
    barLayoutAdjustments.dataLabelPositionsAdjusted === 0
  ) {
    return {
      xml,
      changed: false,
      runsChanged,
      attributesApplied,
      zeroMinimumAxesApplied,
      ...barLayoutAdjustments,
    };
  }

  return {
    xml: new XMLSerializer().serializeToString(document),
    changed: true,
    runsChanged,
    attributesApplied,
    zeroMinimumAxesApplied,
    ...barLayoutAdjustments,
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
      stats.zeroMinimumAxesApplied += result.zeroMinimumAxesApplied;
      stats.categoryLabelsWrapped += result.categoryLabelsWrapped;
      stats.dataLabelPositionsAdjusted +=
        result.dataLabelPositionsAdjusted;
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
