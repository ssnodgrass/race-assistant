import { useState, useEffect, useRef } from 'react';
import { Events } from "@wailsio/runtime";

// Named imports from bindings
import { RaceService, EventService, ParticipantService } from "../bindings/github.com/ssnodgrass/race-assistant/services";
import { Race, Event, Participant } from "../bindings/github.com/ssnodgrass/race-assistant/models";
import { DatabaseService } from "../bindings/github.com/ssnodgrass/race-assistant";

// Components
import { RaceList } from './components/RaceList';
import { CreateRace } from './components/CreateRace';
import { RaceDashboard } from './components/RaceDashboard';
import { EventManagement } from './components/EventManagement';
import { AwardConfigView } from './components/AwardConfigView';
import { ParticipantManagement } from './components/ParticipantManagement';
import { PlacementEntry } from './components/PlacementEntry';
import { TimeEntry } from './components/TimeEntry';
import { AwardsView } from './components/AwardsView';
import { CSVImport } from './components/CSVImport';
import { StopwatchImport } from './components/StopwatchImport';
import { LiveResults } from './components/LiveResults';

import './index.css';

type View = 'list' | 'race_detail' | 'create_race' | 'manage_events' | 'award_config' | 'participants' | 'placements' | 'times' | 'awards' | 'reporting' | 'import_csv' | 'stopwatch' | 'live_display';

function App() {
  const [dbPath, setDbPath] = useState<string>('');
  const [view, setView] = useState<View>('list');
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isExternalDisplay, setIsExternalDisplay] = useState(false);
  const isBrowserMode = !(window as any).wails;

  const selectedRaceRef = useRef<Race | null>(null);
  useEffect(() => { 
    selectedRaceRef.current = selectedRace; 
    if (!isBrowserMode && selectedRace) {
        DatabaseService.SetActiveRace(selectedRace.id);
    }
  }, [selectedRace]);

  const checkStatus = () => {
    const isWeb = !(window as any).wails;
    const statusCall = isWeb 
        ? fetch("/api/status").then(r => r.json())
        : DatabaseService.GetStatus();

    statusCall.then(status => {
        const path = status.dbPath;
        const activeHostRaceID = status.activeRaceID;

        if (path) {
            const isNewPath = path !== dbPath;
            if (isNewPath) setDbPath(path);
            
            if (isNewPath || races.length === 0) {
                loadRaces().then(list => {
                    const params = new URLSearchParams(window.location.search);
                    const raceIDParam = params.get('raceID');
                    if (raceIDParam) {
                        const target = list?.find((r: any) => r.id === parseInt(raceIDParam));
                        if (target) setSelectedRace(target);
                    } else if (activeHostRaceID > 0) {
                        const target = list?.find((r: any) => r.id === activeHostRaceID);
                        if (target) setSelectedRace(target);
                    } else if (list && list.length > 0 && (window.location.search.includes('view') || !selectedRaceRef.current)) {
                        setSelectedRace(list[0]);
                    }
                });
            } else if (isBrowserMode && activeHostRaceID > 0 && (!selectedRace || selectedRace.id !== activeHostRaceID)) {
                const target = races.find(r => r.id === activeHostRaceID);
                if (target) setSelectedRace(target);
            }
        }
    }).catch(() => {});
  };

  useEffect(() => {
    checkStatus();
    const heartbeat = setInterval(checkStatus, 3000);

    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    if (viewParam) {
        setIsExternalDisplay(true);
        setView(viewParam as View);
    }

    let unsubs: (() => void)[] = [];
    if (!isBrowserMode) {
        const u1 = Events.On('db:connected', (e) => {
            setDbPath(e.data as string); loadRaces(); 
            if (window.location.search === "") { setView('list'); setSelectedRace(null); }
        });
        const u2 = Events.On('db:closed', () => {
            setDbPath(''); setRaces([]); setSelectedRace(null); setView('list');
        });
        unsubs = [u1, u2];
    }

    return () => { unsubs.forEach(u => u()); clearInterval(heartbeat); };
  }, [dbPath, races.length, isBrowserMode]);

  useEffect(() => {
    if (selectedRace) loadRaceDetails(selectedRace.id);
  }, [selectedRace]);

  const loadRaces = async () => {
    try {
        const list = isBrowserMode 
            ? await fetch("/api/races").then(r => r.json())
            : await RaceService.ListRaces();
        setRaces(list || []);
        return list;
    } catch (e) { return []; }
  };

  const refreshActiveRace = () => {
    if (!selectedRace) return;
    loadRaces().then(list => {
        const updated = list?.find((r: any) => r.id === selectedRace.id);
        if (updated) setSelectedRace(updated);
    });
  };

  const loadRaceDetails = async (id: number) => {
    try {
        const evs = isBrowserMode 
            ? await fetch(`/api/events?raceID=${id}`).then(r => r.json())
            : await EventService.ListEvents(id);
        setEvents(evs || []);
        
        if (!isBrowserMode) {
            ParticipantService.ListParticipants(id).then(pts => setParticipants(pts || [])).catch(console.error);
        }
    } catch (e) { console.error(e); }
  };

  const NavItem = ({ label, target, icon }: { label: string, target: View, icon: string }) => (
    <div className={`nav-item ${view === target ? 'active' : ''}`} onClick={() => setView(target)}>
        <span>{icon}</span> {label}
    </div>
  );

  if (isExternalDisplay || isBrowserMode) {
    return (
        <div style={{ backgroundColor: '#000', color: 'white', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-md) var(--space-xl)', borderBottom: '1px solid #222', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '2.2rem' }}>Race Hub</h2>
                    <select value={selectedRace?.id || ''} onChange={e => {
                        const r = races.find(it => it.id === parseInt(e.target.value));
                        if (r) setSelectedRace(r);
                    }} style={{ padding: '10px', fontSize: '1.1rem', minWidth: '300px' }}>
                        <option value="">-- Select Race --</option>
                        {races.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>
                <div className="flex-row">
                    <button onClick={() => setView('live_display')} style={{ backgroundColor: view === 'live_display' ? 'var(--accent)' : '#222', padding: '10px 20px', fontSize: '1.1rem' }}>Live Board</button>
                    <button onClick={() => setView('awards')} style={{ backgroundColor: view === 'awards' ? 'var(--accent)' : '#222', padding: '10px 20px', fontSize: '1.1rem' }}>Awards</button>
                    <button onClick={() => setView('reporting')} style={{ backgroundColor: view === 'reporting' ? 'var(--accent)' : '#222', padding: '10px 20px', fontSize: '1.1rem' }}>Standings</button>
                </div>
            </div>

            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                {selectedRace ? (
                    <div className="view-container" style={{ height: '100%' }}>
                        {view === 'live_display' && <LiveResults events={events} selectedRace={selectedRace} onRefresh={refreshActiveRace} isBrowser={isBrowserMode} />}
                        {view === 'awards' && <AwardsView events={events} mode="awards" isExternal={true} isBrowser={isBrowserMode} />}
                        {view === 'reporting' && <AwardsView events={events} mode="standings" isExternal={true} isBrowser={isBrowserMode} />}
                        {view !== 'live_display' && view !== 'awards' && view !== 'reporting' && <LiveResults events={events} selectedRace={selectedRace} onRefresh={refreshActiveRace} isBrowser={isBrowserMode} />}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', paddingTop: '100px' }}>
                        <h1>Race Results Hub</h1>
                        <p className="text-dim">Waiting for the race host to select a race...</p>
                    </div>
                )}
            </div>
        </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
            Race Assistant
            <div style={{ fontSize: '0.6em', color: 'var(--text-dim)', fontWeight: 'normal', marginTop: '5px' }}>
                {dbPath ? dbPath.split('/').pop() : 'No Database'}
            </div>
        </div>
        <nav className="sidebar-nav">
            {dbPath ? (
                <>
                    <NavItem label="Select Race" target="list" icon="🏁" />
                    {selectedRace && (
                        <>
                            <div className="sidebar-divider">Current Race</div>
                            <NavItem label="Dashboard" target="race_detail" icon="📊" />
                            <NavItem label="Events" target="manage_events" icon="📐" />
                            <NavItem label="Awards Config" target="award_config" icon="⚙️" />
                            <NavItem label="Participants" target="participants" icon="🏃" />
                            <div className="sidebar-divider">Entry & Results</div>
                            <NavItem label="Placements" target="placements" icon="🥇" />
                            <NavItem label="Stopwatch Import" target="stopwatch" icon="⏱️" />
                            <NavItem label="Manual Times" target="times" icon="🖊️" />
                            <NavItem label="Process Awards" target="awards" icon="🏆" />
                            <NavItem label="Full Reporting" target="reporting" icon="📄" />
                            <NavItem label="Live Display" target="live_display" icon="📺" />
                            <div className="sidebar-divider">External</div>
                            <div className="nav-item" onClick={() => DatabaseService.OpenExternalWindow('live_display', selectedRace.id)} style={{ color: 'var(--success)' }}>
                                🖥️ Launch Live Board
                            </div>
                            <div className="nav-item" onClick={() => DatabaseService.OpenExternalWindow('reporting', selectedRace.id)} style={{ color: 'var(--success)' }}>
                                🖥️ Launch Results TV
                            </div>
                        </>
                    )}
                </>
            ) : (
                <div style={{ padding: '20px', color: 'var(--text-dim)', fontSize: '0.9em' }}>Open a database to begin.</div>
            )}
        </nav>
        <div className="sidebar-footer">
            {dbPath && <button onClick={() => DatabaseService.Close()} style={{ width: '100%', backgroundColor: '#444' }}>Close Database</button>}
        </div>
      </aside>

      <main className="main-content">
        {!dbPath ? (
            <div className="view-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <h1>Welcome to Race Assistant</h1>
                <p>Start by creating a new database or opening an existing one.</p>
                <div className="flex-row" style={{ marginTop: '20px' }}>
                    <button style={{ padding: '15px 30px', fontSize: '1.1em' }} onClick={() => DatabaseService.New()}>Create New Database</button>
                    <button style={{ padding: '15px 30px', fontSize: '1.1em', backgroundColor: '#444' }} onClick={() => DatabaseService.Open()}>Open Database</button>
                </div>
            </div>
        ) : (
            <div className="view-container">
                {view === 'list' && (
                <RaceList races={races} onSelectRace={(r) => { setSelectedRace(r); setView('race_detail'); }} onRefresh={loadRaces} onCreateRace={() => setView('create_race')} />
                )}
                {view === 'create_race' && (
                <CreateRace onCreated={(r) => { setSelectedRace(r); setView('race_detail'); loadRaces(); }} onCancel={() => setView('list')} />
                )}
                {selectedRace && (
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {view === 'race_detail' && <RaceDashboard race={selectedRace} events={events} participants={participants} onRefresh={refreshActiveRace} />}
                    {view === 'manage_events' && <EventManagement raceID={selectedRace.id} events={events} onRefresh={() => loadRaceDetails(selectedRace.id)} />}
                    {view === 'award_config' && <AwardConfigView events={events} />}
                    {view === 'participants' && <ParticipantManagement raceID={selectedRace.id} events={events} participants={participants} onRefresh={refreshActiveRace} onImport={() => setView('import_csv')} />}
                    {view === 'placements' && <PlacementEntry race={selectedRace} participants={participants} events={events} onRefresh={refreshActiveRace} />}
                    {view === 'times' && <TimeEntry raceID={selectedRace.id} events={events} />}
                    {view === 'awards' && <AwardsView events={events} mode="awards" />}
                    {view === 'reporting' && <AwardsView events={events} mode="standings" />}
                    {view === 'stopwatch' && <StopwatchImport raceID={selectedRace.id} events={events} onComplete={() => setView('race_detail')} />}
                    {view === 'live_display' && <LiveResults events={events} selectedRace={selectedRace} onRefresh={refreshActiveRace} isBrowser={isBrowserMode} />}
                    {view === 'import_csv' && (
                        <CSVImport raceID={selectedRace.id} events={events} onComplete={(count) => { loadRaceDetails(selectedRace.id); setView('participants'); }} onCancel={() => setView('participants')} />
                    )}
                </div>
                )}
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
