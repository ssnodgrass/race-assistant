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

import './index.css';

type View = 'list' | 'race_detail' | 'create_race' | 'manage_events' | 'award_config' | 'participants' | 'placements' | 'times' | 'awards' | 'reporting' | 'import_csv';

function App() {
  const [dbPath, setDbPath] = useState<string>('');
  const [view, setView] = useState<View>('list');
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  const selectedRaceRef = useRef<Race | null>(null);
  const eventsRef = useRef<Event[]>([]);

  useEffect(() => { selectedRaceRef.current = selectedRace; }, [selectedRace]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    const unsubDB = Events.On('db:connected', (e) => {
      setDbPath(e.data as string);
      loadRaces();
      setView('list');
      setSelectedRace(null);
    });

    const unsubDBClose = Events.On('db:closed', () => {
        setDbPath('');
        setRaces([]);
        setSelectedRace(null);
        setView('list');
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
      if (currentRace) {
        setView(me.view);
      }
    }));

    return () => { unsubDB(); unsubDBClose(); unsubs.forEach(u => u()); };
  }, []);

  useEffect(() => {
    if (selectedRace) loadRaceDetails(selectedRace.id);
  }, [selectedRace]);

  const loadRaces = () => RaceService.ListRaces().then(setRaces).catch(console.error);
  const loadRaceDetails = (id: number) => {
    EventService.ListEvents(id).then(evs => setEvents(evs || [])).catch(console.error);
    ParticipantService.ListParticipants(id).then(pts => setParticipants(pts || [])).catch(console.error);
  };

  const NavItem = ({ label, target, icon }: { label: string, target: View, icon: string }) => (
    <div className={`nav-item ${view === target ? 'active' : ''}`} onClick={() => setView(target)}>
        <span>{icon}</span> {label}
    </div>
  );

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
                            <NavItem label="Stopwatch Times" target="times" icon="⏱️" />
                            <NavItem label="Process Awards" target="awards" icon="🏆" />
                            <NavItem label="Full Reporting" target="reporting" icon="📄" />
                        </>
                    )}
                </>
            ) : (
                <div style={{ padding: '20px', color: 'var(--text-dim)', fontSize: '0.9em' }}>
                    Open a database to begin.
                </div>
            )}
        </nav>
        <div className="sidebar-footer">
            {dbPath && <button onClick={() => DatabaseService.Close()} style={{ width: '100%', backgroundColor: '#444' }}>Close Database</button>}
        </div>
      </aside>

      <main className="main-content">
        {!dbPath ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <h1>Welcome to Race Assistant</h1>
                <p>Start by creating a new database or opening an existing one.</p>
                <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    <button style={{ padding: '15px 30px', fontSize: '1.1em' }} onClick={() => DatabaseService.New()}>Create New Database</button>
                    <button style={{ padding: '15px 30px', fontSize: '1.1em', backgroundColor: '#444' }} onClick={() => DatabaseService.Open()}>Open Database</button>
                </div>
            </div>
        ) : (
            <>
                {view === 'list' && (
                <RaceList 
                    races={races} 
                    onSelectRace={(r) => { setSelectedRace(r); setView('race_detail'); }} 
                    onRefresh={loadRaces}
                    onCreateRace={() => setView('create_race')}
                />
                )}

                {view === 'create_race' && (
                <CreateRace 
                    onCreated={(r) => { setSelectedRace(r); setView('race_detail'); loadRaces(); }} 
                    onCancel={() => setView('list')} 
                />
                )}

                {selectedRace && (
                <div className="view-container">
                    {view === 'race_detail' && <RaceDashboard race={selectedRace} events={events} participants={participants} />}
                    {view === 'manage_events' && <EventManagement raceID={selectedRace.id} events={events} onRefresh={() => loadRaceDetails(selectedRace.id)} />}
                    {view === 'award_config' && <AwardConfigView events={events} />}
                    {view === 'participants' && <ParticipantManagement raceID={selectedRace.id} events={events} participants={participants} onRefresh={() => loadRaceDetails(selectedRace.id)} onImport={() => setView('import_csv')} />}
                    {view === 'placements' && <PlacementEntry raceID={selectedRace.id} participants={participants} events={events} />}
                    {view === 'times' && <TimeEntry raceID={selectedRace.id} />}
                                {view === 'awards' && <AwardsView events={events} mode="awards" />}
                                {view === 'reporting' && <AwardsView events={events} mode="standings" />}
                                        {view === 'import_csv' && (
                        <CSVImport 
                            raceID={selectedRace.id} 
                            events={events} 
                            onComplete={(count) => {
                                alert(`Imported ${count} participants.`);
                                loadRaceDetails(selectedRace.id);
                                setView('participants');
                            }}
                            onCancel={() => setView('participants')}
                        />
                    )}
                </div>
                )}

                {dbPath && !selectedRace && view !== 'list' && view !== 'create_race' && (
                <div className="card" style={{ textAlign: 'center', padding: '50px' }}>
                    <h2>No Active Race</h2>
                    <p>Please select a race from the sidebar or click below.</p>
                    <button onClick={() => setView('list')}>View All Races</button>
                </div>
                )}
            </>
        )}
      </main>
    </div>
  );
}

export default App;
