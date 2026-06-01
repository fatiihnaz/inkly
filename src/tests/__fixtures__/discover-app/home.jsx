import { withCms } from "inscribed";
import Hero from "./components/Hero";
import Shared from "./components/Shared";
import Wrapper from "./passthrough/Wrapper";

function Home() {
  return (
    <main>
      <EditableRegion blockPath="hero.title" blockType="Text" defaultValue="Welcome" />
      <Hero />
      <Shared />
      <Wrapper />
    </main>
  );
}

export default withCms("/home", Home);
