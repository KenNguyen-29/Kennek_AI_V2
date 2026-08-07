import { BootGate } from "./components/BootSequence";
import { Chat } from "./components/Chat";

export default function Home() {
  return (
    <BootGate>
      <Chat />
    </BootGate>
  );
}
