import Settings from "./Pages/settings";
import Menu from "./menu";

export default function Home() {
  return (
    <div className="flex h-screen">
      <div className="h-full">
        <Menu />
      </div>
      <div className="flex-1 p-3">
        <Settings />
      </div>
    </div>
  );
}
