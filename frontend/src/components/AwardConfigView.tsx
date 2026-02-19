import React, { useState, useEffect } from 'react';
import { EventService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { AwardConfig, Event as RaceEvent, AgeGroup, AwardStrategy } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface AwardConfigViewProps {
  events: RaceEvent[];
}

export const AwardConfigView: React.FC<AwardConfigViewProps> = ({ events }) => {
  const [selectedID, setSelectedID] = useState<number>(events[0]?.id || 0);
  const [config, setConfig] = useState<AwardConfig | null>(null);

  useEffect(() => {
    if (selectedID > 0) {
      EventService.GetAwardConfig(selectedID).then(setConfig).catch(console.error);
    }
  }, [selectedID]);

  const handleSave = () => {
    if (config) {
      EventService.SaveAwardConfig(config)
        .then(() => alert("Configuration Saved Successfully"))
        .catch(console.error);
    }
  };

  const generateAgeGroups = (interval: number) => {
    if (!config) return;
    const groups: AgeGroup[] = [];
    groups.push(new AgeGroup({ min: 0, max: 9 }));
    for (let i = 10; i < 70; i += interval) {
        groups.push(new AgeGroup({ min: i, max: i + interval - 1 }));
    }
    groups.push(new AgeGroup({ min: 70, max: 99 }));
    setConfig({ ...config, age_groups: groups });
  };

  const addAgeGroup = () => {
    if (!config) return;
    const newGroup = new AgeGroup({ min: 0, max: 0 });
    setConfig({ ...config, age_groups: [...config.age_groups, newGroup] });
  };

  const updateAgeGroup = (index: number, field: 'min' | 'max', value: number) => {
    if (!config) return;
    const newGroups = [...config.age_groups];
    newGroups[index] = new AgeGroup({ ...newGroups[index], [field]: value });
    setConfig({ ...config, age_groups: newGroups });
  };

  const removeAgeGroup = (index: number) => {
    if (!config) return;
    setConfig({ ...config, age_groups: config.age_groups.filter((_, i) => i !== index) });
  };

  if (events.length === 0) return (
    <div className="card">
      <p className="text-dim">No events available. Create events first.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex-between" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="flex-row">
            <h2>Award Configuration</h2>
            <select value={selectedID} onChange={e => setSelectedID(Number(e.target.value))} style={{ minWidth: '200px' }}>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
        </div>
        <button onClick={handleSave} style={{ backgroundColor: 'var(--success)' }}>
            💾 SAVE ALL SETTINGS
        </button>
      </div>

      {config && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--space-lg)', flexGrow: 1, minHeight: 0 }}>
          <div className="card" style={{ margin: 0, overflowY: 'auto' }}>
            <h3>Logic & Categories</h3>
            
            <section style={{ marginBottom: 'var(--space-lg)', borderBottom: '1px solid var(--border)', paddingBottom: 'var(--space-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '1.1rem' }}>
                <input type="checkbox" checked={config.include_overall} onChange={e => setConfig({...config, include_overall: e.target.checked})} style={{ width: 'auto' }} />
                <strong>Overall Winners</strong>
              </label>
              {config.include_overall && (
                <div style={{ marginLeft: '30px', marginTop: '10px' }} className="flex-row">
                    <span>Places:</span>
                    <input type="number" value={config.overall_count} onChange={e => setConfig({...config, overall_count: Number(e.target.value)})} style={{width: '80px'}} />
                </div>
              )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                <section className="card" style={{ backgroundColor: '#ffffff03', padding: 'var(--space-md)', margin: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={config.include_masters} onChange={e => setConfig({...config, include_masters: e.target.checked})} style={{ width: 'auto' }} />
                        <strong>Masters</strong>
                    </label>
                    {config.include_masters && (
                        <div style={{ marginTop: '10px' }}>
                            <div style={{ marginBottom: '8px' }}><label>Min Age:</label><input type="number" value={config.masters_age} onChange={e => setConfig({...config, masters_age: Number(e.target.value)})} style={{ width: '100%' }} /></div>
                            <div><label>Count:</label><input type="number" value={config.masters_count} onChange={e => setConfig({...config, masters_count: Number(e.target.value)})} style={{ width: '100%' }} /></div>
                        </div>
                    )}
                </section>

                <section className="card" style={{ backgroundColor: '#ffffff03', padding: 'var(--space-md)', margin: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={config.include_grand_masters} onChange={e => setConfig({...config, include_grand_masters: e.target.checked})} style={{ width: 'auto' }} />
                        <strong>Grand Masters</strong>
                    </label>
                    {config.include_grand_masters && (
                        <div style={{ marginTop: '10px' }}>
                            <div style={{ marginBottom: '8px' }}><label>Min Age:</label><input type="number" value={config.grand_masters_age} onChange={e => setConfig({...config, grand_masters_age: Number(e.target.value)})} style={{ width: '100%' }} /></div>
                            <div><label>Count:</label><input type="number" value={config.grand_masters_count} onChange={e => setConfig({...config, grand_masters_count: Number(e.target.value)})} style={{ width: '100%' }} /></div>
                        </div>
                    )}
                </section>

                <section className="card" style={{ backgroundColor: '#ffffff03', padding: 'var(--space-md)', margin: 0, gridColumn: 'span 2' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={config.include_senior_grand_masters} onChange={e => setConfig({...config, include_senior_grand_masters: e.target.checked})} style={{ width: 'auto' }} />
                        <strong>Senior Grand Masters</strong>
                    </label>
                    {config.include_senior_grand_masters && (
                        <div style={{ marginTop: '10px' }} className="flex-row">
                            <div style={{ flex: 1 }}><label>Min Age:</label><input type="number" value={config.senior_grand_masters_age} onChange={e => setConfig({...config, senior_grand_masters_age: Number(e.target.value)})} /></div>
                            <div style={{ flex: 1 }}><label>Count:</label><input type="number" value={config.senior_grand_masters_count} onChange={e => setConfig({...config, senior_grand_masters_count: Number(e.target.value)})} /></div>
                        </div>
                    )}
                </section>
            </div>

            <section className="card" style={{ backgroundColor: 'rgba(0, 123, 255, 0.05)', marginTop: 'var(--space-md)', border: '1px solid rgba(0, 123, 255, 0.2)', margin: 'var(--space-md) 0 0 0' }}>
              <h4>Award Strategy</h4>
              <select value={config.award_strategy} onChange={e => setConfig({...config, award_strategy: Number(e.target.value) as AwardStrategy})} style={{ marginBottom: '10px' }}>
                  <option value={AwardStrategy.AwardStrategyPrestigious}>Prestigious (Cascade)</option>
                  <option value={AwardStrategy.AwardStrategyDistributed}>Distributed</option>
              </select>
              <p className="text-dim" style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                {config.award_strategy === AwardStrategy.AwardStrategyPrestigious 
                    ? "Cascade: Winners are pulled into the highest category they qualify for. One trophy per person."
                    : "Distributed: Participants can only win within their specific age group."}
              </p>
              
              <div style={{ marginTop: '15px' }} className="flex-between">
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
                    <input type="checkbox" checked={config.split_gender} onChange={e => setConfig({...config, split_gender: e.target.checked})} style={{ width: 'auto' }} />
                    <span>Split by Gender</span>
                </label>
                <div className="flex-row">
                    <span className="text-dim">Depth:</span>
                    <input type="number" value={config.age_group_depth} onChange={e => setConfig({...config, age_group_depth: Number(e.target.value)})} style={{width: '70px'}} />
                </div>
              </div>
            </section>
          </div>

          <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="flex-between" style={{ marginBottom: 'var(--space-md)' }}>
                <h3>Age Groups</h3>
                <div className="flex-row">
                    <button onClick={() => generateAgeGroups(5)} style={{ backgroundColor: '#444', padding: '6px 12px' }}>5-Year</button>
                    <button onClick={() => generateAgeGroups(10)} style={{ backgroundColor: '#444', padding: '6px 12px' }}>10-Year</button>
                </div>
            </div>
            
            <div className="table-container" style={{ margin: 0 }}>
                <table style={{ width: '100%' }}>
                <thead>
                    <tr><th>Min</th><th>Max</th><th style={{ textAlign: 'right' }}>Action</th></tr>
                </thead>
                <tbody>
                    {config.age_groups.map((ag, i) => (
                    <tr key={i}>
                        <td><input type="number" value={ag.min} onChange={e => updateAgeGroup(i, 'min', Number(e.target.value))} style={{width: '80px'}} /></td>
                        <td><input type="number" value={ag.max} onChange={e => updateAgeGroup(i, 'max', Number(e.target.value))} style={{width: '80px'}} /></td>
                        <td style={{ textAlign: 'right' }}>
                            <button onClick={() => removeAgeGroup(i)} style={{ backgroundColor: 'transparent', color: 'var(--danger)', fontSize: '1.2rem', padding: '0 8px' }}>×</button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            
            <button onClick={addAgeGroup} style={{ backgroundColor: '#444', width: '100%', marginTop: 'var(--space-md)' }}>+ Custom Row</button>
          </div>
        </div>
      )}
    </div>
  );
};
