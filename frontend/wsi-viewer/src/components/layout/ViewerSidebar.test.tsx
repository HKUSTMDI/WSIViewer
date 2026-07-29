import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ViewerSidebar from "./ViewerSidebar";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useViewerStore } from "@/stores/viewerStore";
import type { Annotation } from "@/types/annotation";

const annotation: Annotation = {
  id: "annotation-1",
  type: "Annotation",
  body: {
    type: "TextualBody",
    purpose: "commenting",
    value: "Tumor",
  },
  target: { selector: {} },
  created: "2026-07-29T00:00:00Z",
  modified: "2026-07-29T00:00:00Z",
  revision: 1,
};

beforeEach(() => {
  useViewerStore.setState({
    sidebarOpen: true,
    annoActions: null,
  });
  useAnnotationStore.setState({
    annotations: [],
    selectedId: null,
  });
});

describe("ViewerSidebar", () => {
  it("keeps the GeoJSON export action visible when there are no annotations", () => {
    const { getByRole, queryByRole } = render(
      <ViewerSidebar
        onUpdateAnnotation={vi.fn()}
        onExportGeoJson={vi.fn()}
      />,
    );

    expect(
      getByRole("button", { name: "Export annotations as GeoJSON" }),
    ).toBeDisabled();
    expect(queryByRole("form", { name: "Edit annotation" })).toBeNull();
  });

  it("exports annotations and displays the selected annotation editor", () => {
    const onExport = vi.fn();
    useAnnotationStore.setState({
      annotations: [annotation],
      selectedId: annotation.id,
    });
    const { getByRole, getByLabelText } = render(
      <ViewerSidebar
        onUpdateAnnotation={vi.fn()}
        onExportGeoJson={onExport}
      />,
    );

    fireEvent.click(
      getByRole("button", { name: "Export annotations as GeoJSON" }),
    );

    expect(onExport).toHaveBeenCalledOnce();
    expect(getByRole("form", { name: "Edit annotation" })).toBeVisible();
    expect(getByLabelText("Label")).toHaveValue("Tumor");
  });

  it("is hidden when the sidebar is closed", () => {
    useViewerStore.setState({ sidebarOpen: false });
    const { container } = render(
      <ViewerSidebar
        onUpdateAnnotation={vi.fn()}
        onExportGeoJson={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
