import LiveHeader from "@/components/LiveHeader";
import AssetRows from "@/components/AssetRows";
import QuickConverter from "@/components/QuickConverter";
import MinMaxTracker from "@/components/MinMaxTracker";
import StatusFooter from "@/components/StatusFooter";

export default function Home() {
  return (
    <main className="tala-page min-h-screen py-8">
      <LiveHeader />
      <AssetRows />
      <QuickConverter />
      <MinMaxTracker />
      <StatusFooter />
    </main>
  );
}
