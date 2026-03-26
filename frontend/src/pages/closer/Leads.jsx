import LeadsList from "../../components/shared/LeadsList";

export default function Leads() {
  return <LeadsList scriptTypeFilter={["admin", "opener", "closer"]} showTransferButton={false} />;
}
