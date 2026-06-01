import { withCms } from "inscribed";
import Shared from "./components/Shared";

function About() {
  return (
    <main>
      <EditableRegion blockPath="about.body" blockType="RichText" defaultValue="" />
      <Shared />
    </main>
  );
}

export default withCms("/about", About);
