import Header from "../adminDashboard/Header";
import { PageTitle } from "../siteOnboarding/ui";
import UsersPanel from "./UsersPanel";

export default function AccessControl() {
  return (
    <div>
      <Header />
      <PageTitle crumbs={[{ label: "Governance" }]} title="Access & roles" subtitle="Every client user gets a generated username (like a PAN: five letters, four digits, one letter) and a one-time password, and sees only the part of the network they cover. Company and site pages offer the same controls in context." />
      <UsersPanel
        title="Client users"
        subtitle="Each user covers one part of the network: a company, a zone, a regional office or a single site."
        url="/governance/access/users"
        emptyText="No client users yet."
      />
    </div>
  );
}
