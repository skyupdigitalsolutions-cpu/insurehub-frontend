import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { StepUpProvider } from './auth/StepUp';
import { Rail } from './shell/Rail';
import { WireLog } from './wire/WireLog';
import { Button } from './ui/Button';
import { LoginScreen } from './modules/auth/LoginScreen';
import { AccessModule } from './modules/auth/AccessModule';
import { TeamModule } from './modules/team/TeamModule';
import { LeadsModule } from './modules/leads/LeadsModule';
import { CustomersModule } from './modules/customers/CustomersModule';
import { DevToolsModule } from './modules/dev/DevToolsModule';

const SCREENS: Record<string, () => React.JSX.Element | null> = {
  auth: AccessModule, team: TeamModule, leads: LeadsModule, customers: CustomersModule, dev: DevToolsModule,
};

function Banners() {
  const { user, idleWarning, reload, signOut } = useAuth();
  if (!user) return null;
  return (
    <>
      {user.readOnly && (
        <div role="alert" className="bg-bad-tint px-[clamp(20px,4vw,56px)] py-2 text-[0.875rem] text-bad">
          Your subscription has ended. You can view and export your records, but you cannot create, edit or send anything until you renew.
        </div>
      )}
      {idleWarning && (
        <div role="alert" className="flex flex-wrap items-center gap-3 bg-warn-tint px-[clamp(20px,4vw,56px)] py-2 text-[0.875rem] text-warn">
          {idleWarning}
          <Button onClick={() => reload()}>Stay signed in</Button>
          <Button variant="link" onClick={() => signOut()}>Log out</Button>
        </div>
      )}
    </>
  );
}

function Workspace() {
  const { status } = useAuth();
  const [active, setActive] = useState('auth');

  let main;
  if (status === 'checking') {
    main = <main className="grid place-items-center"><p className="text-muted">Restoring your session…</p></main>;
  } else if (active === 'dev') {
    main = <DevToolsModule />;
  } else if (status !== 'signedIn') {
    main = <LoginScreen />;
  } else {
    const Screen = SCREENS[active] ?? AccessModule;
    main = <Screen />;
  }

  return (
    // Three columns on desktop (modules | work | test panel); stacked below 1100px.
    <div className="grid h-dvh grid-cols-1 overflow-hidden max-[1100px]:h-auto max-[1100px]:overflow-visible min-[1100px]:grid-cols-[264px_minmax(0,1fr)_minmax(320px,400px)]">
      <Rail active={active} onSelect={setActive} />
      <div className="flex min-h-0 flex-col overflow-hidden [&>main]:min-h-0 [&>main]:flex-1"><Banners />{main}</div>
      <WireLog />
    </div>
  );
}

export default function App() {
  return <AuthProvider><StepUpProvider><Workspace /></StepUpProvider></AuthProvider>;
}
