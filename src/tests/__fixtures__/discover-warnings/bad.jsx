import { withCms } from "inscribed";

const slugVar = "/computed";

function Bad() {
  return (
    <main>
      {/* non-literal withCms slug below is the warning case; this valid one
          gives the snapshot a real manifest to anchor against. */}
      <EditableRegion blockPath="ok.region" blockType="Text" defaultValue="ok" />

      {/* missing blockPath */}
      <EditableRegion blockType="Text" defaultValue="x" />
      {/* missing blockType */}
      <EditableRegion blockPath="a.b" defaultValue="x" />
      {/* missing defaultValue */}
      <EditableRegion blockPath="a.c" blockType="Text" />
      {/* non-literal blockPath */}
      <EditableRegion blockPath={slugVar} blockType="Text" defaultValue="x" />

      {/* list without itemSchema */}
      <EditableList blockPath="a.d" />

      {/* unsupported scope -> warning, treated page-scoped */}
      <EditableRegion blockPath="a.e" blockType="Text" defaultValue="x" scope="weird" />

      {/* CmsGroup without a static name -> transparent wrapper warning */}
      <CmsGroup>
        <EditableRegion blockPath="a.g" blockType="Text" defaultValue="x" />
      </CmsGroup>

      {/* useCmsBlock metadata not a static object */}
      {useCmsBlock("a.h", metaVar)}
      {/* useCmsBlock metadata missing defaultValue */}
      {useCmsBlock("a.i", { blockType: "Text" })}
    </main>
  );
}

// non-literal slug -> warning, no slug root registered for this branch
withCms(slugVar, Bad);

// a valid root so the page-scoped regions above still produce a manifest
export default withCms("/bad", Bad);
