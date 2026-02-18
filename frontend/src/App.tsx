import { useState, useEffect, useRef } from 'react';
import { Events } from "@wailsio/runtime";

// Named imports from bindings
import { RaceService, EventService, ParticipantService } from "../bindings/github.com/ssnodgrass/race-assistant/services";
import { Race, Event, Participant } from "../bindings/github.com/ssnodgrass/race-assistant/models";
import { DatabaseService as DBStatic } from "../bindings/github.com/ssnodgrass/race-assistant";

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
  const [externalMode, setExternalMode] = useState<'live_display' | 'awards' | 'reporting'>('live_display');

  const selectedRaceRef = useRef<Race | null>(null);
  const eventsRef = useRef<Event[]>([]);

  useEffect(() => { selectedRaceRef.current = selectedRace; }, [selectedRace]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    // Check for external display mode in URL
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const raceIDParam = params.get('raceID');

    if (viewParam === 'live_display' || viewParam === 'awards' || viewParam === 'reporting') {
        setIsExternalDisplay(true);
        setExternalMode(viewParam as any);
        setView(viewParam as View);
        
        loadRaces().then(list => {
            if (raceIDParam && list) {
                const target = list.find(r => r.id === parseInt(raceIDParam));
                if (target) setSelectedRace(target);
            } else if (list && list.length > 0) {
                setSelectedRace(list[0]);
            }
        });
    }

    const unsubDB = Events.On('db:connected', (e) => {
      setDbPath(e.data as string);
      loadRaces();
      if (!isExternalDisplay) {
        setView('list');
        setSelectedRace(null);
      }
    });

    const unsubDBClose = Events.On('db:closed', () => {
        setDbPath(''); setRaces([]); setSelectedRace(null); setView('list');
    });

    const menuEvents: { name: string, view: View }[] = [
      { name: 'menu:new-race', view: 'create_race' },
      { name: 'menu:view-races', view: 'list' },
      { name: 'menu:manage-events', view: 'manage_events' },
      { name: 'menu:award-config', view: 'award_config' },
      { name: 'menu:view-participants', view: 'participants' },
      { name: 'menu:enter-placements', view: 'placements' },
      { name: 'menu:enter-times', view: 'times' },
      { name: 'menu:view-awards', view: 'awards' },
      { name: 'menu:view-reporting', view: 'reporting' },
      { name: 'menu:import-participants', view: 'import_csv' },
      { name: 'menu:import-placements', view: 'placements' },
    ];

    const unsubs = menuEvents.map(me => Events.On(me.name, () => {
      if (me.view === 'list' || me.view === 'create_race') {
        setSelectedRace(null); setView(me.view); return;
      }
      const currentRace = selectedRaceRef.current;
      if (currentRace) setView(me.view);
    }));

    return () => { unsubDB(); unsubDBClose(); unsubs.forEach(u => u()); };
  }, []);

  useEffect(() => {
    if (selectedRace) loadRaceDetails(selectedRace.id);
  }, [selectedRace]);

  const loadRaces = async () => {
    try {
        const list = await RaceService.ListRaces();
        setRaces(list || []);
        return list;
    } catch (e) { console.error(e); return []; }
  };

  const refreshActiveRace = () => {
    if (!selectedRace) return;
    RaceService.ListRaces().then(list => {
        const updated = list?.find(r => r.id === selectedRace.id);
        if (updated) setSelectedRace(updated);
    });
  };

  const loadRaceDetails = (id: number) => {
    EventService.ListEvents(id).then(evs => setEvents(evs || [])).catch(console.error);
    ParticipantService.ListParticipants(id).then(pts => setParticipants(pts || [])).catch(console.error);
  };

  const NavItem = ({ label, target, icon }: { label: string, target: View, icon: string }) => (
    <div className={`nav-item ${view === target ? 'active' : ''}`} onClick={() => setView(target)}>
        <span>{icon}</span> {label}
    </div>
  );

  if (isExternalDisplay) {
    return (
        <div style={{ padding: '40px', backgroundColor: '#000', minHeight: '100vh', color: 'white' }}>
            {selectedRace ? (
                <>
                    {externalMode === 'live_display' && <LiveResults events={events} selectedRace={selectedRace} onRefresh={refreshActiveRace} />}
                    {externalMode === 'awards' && <AwardsView events={events} mode="awards" isExternal={true} />}
                    {externalMode === 'reporting' && <AwardsView events={events} mode="standings" isExternal={true} />}
                </>
            ) : (
                <div style={{ textAlign: 'center', paddingTop: '100px' }}>
                    <h1>Waiting for Race Data...</h1>
                </div>
            )}
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
                            <div className="nav-item" onClick={() => DBStatic.OpenExternalWindow('live_display', selectedRace.id)} style={{ color: 'var(--success)' }}>
                                🖥️ Launch Live Board
                            </div>
                            <div className="nav-item" onClick={() => DBStatic.OpenExternalWindow('reporting', selectedRace.id)} style={{ color: 'var(--success)' }}>
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
            {dbPath && <button onClick={() => DBStatic.Close()} style={{ width: '100%', backgroundColor: '#444' }}>Close Database</button>}
        </div>
      </aside>

      <main className="main-content">
        {!dbPath ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <h1>Welcome to Race Assistant</h1>
                <p>Start by creating a new database or opening an existing one.</p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    <button style={{ padding: '15px 30px', fontSize: '1.1em' }} onClick={() => DBStatic.New()}>Create New Database</button>
                    <button style={{ padding: '15px 30px', fontSize: '1.1em', backgroundColor: '#444' }} onClick={() => DBStatic.Open()}>Open Database</button>
                </div>
            </div>
        ) : (
            <>
                {view === 'list' && (
                <RaceList races={races} onSelectRace={(r) => { setSelectedRace(r); setView('race_detail'); }} onRefresh={loadRaces} onCreateRace={() => setView('create_race')} />
                )}
                {view === 'create_race' && (
                <CreateRace onCreated={(r) => { setSelectedRace(r); setView('race_detail'); loadRaces(); }} onCancel={() => setView('list')} />
                )}
                {selectedRace && (
                <div className="view-container">
                    {view === 'race_detail' && <RaceDashboard race={selectedRace} events={events} participants={participants} onRefresh={refreshActiveRace} />}
                    {view === 'manage_events' && <EventManagement raceID={selectedRace.id} events={events} onRefresh={() => loadRaceDetails(selectedRace.id)} />}
                    {view === 'award_config' && <AwardConfigView events={events} />}
                    {view === 'participants' && <ParticipantManagement raceID={selectedRace.id} events={events} participants={participants} onRefresh={() => loadRaceDetails(selectedRace.id)} onImport={() => setView('import_csv')} />}
                    {view === 'placements' && <PlacementEntry race={selectedRace} participants={participants} events={events} onRefresh={refreshActiveRace} />}
                    {view === 'times' && <TimeEntry raceID={selectedRace.id} />}
                    {view === 'awards' && <AwardsView events={events} mode="awards" />}
                    {view === 'reporting' && <AwardsView events={events} mode="standings" />}
                    {view === 'stopwatch' && <StopwatchImport raceID={selectedRace.id} onComplete={() => setView('race_detail')} />}
                    {view === 'live_display' && <LiveResults events={events} selectedRace={selectedRace} onRefresh={refreshActiveRace} />}
                    {view === 'import_csv' && (
                        <CSVImport raceID={selectedRace.id} events={events} onComplete={(count) => { loadRaceDetails(selectedRace.id); setView('participants'); }} onCancel={() => setView('participants')} />
                    )}
                </div>
                )}
            </>
        )}
      </main>
    </div>
  );
}

export default App;
