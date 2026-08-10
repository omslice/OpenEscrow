import { createBaseBuilderDataSuffix } from "./baseBuilderAttribution";

export const BASE_BUILDER_CODE =
  import.meta.env.VITE_BASE_BUILDER_CODE?.trim() ?? "";

export const BASE_BUILDER_DATA_SUFFIX = createBaseBuilderDataSuffix(
  BASE_BUILDER_CODE,
);
