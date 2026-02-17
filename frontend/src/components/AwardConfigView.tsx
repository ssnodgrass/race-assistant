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
        .then(() => alert("Configuration Saved"))
        .catch(console.error);
    }
  };

  const generateAgeGroups = (interval: number) => {
    if (!config) return;
    const groups: AgeGroup[] = [];
    
    // 9 & Under
    groups.push(new AgeGroup({ min: 0, max: 9 }));
    
    // Middle groups (10-14, 15-19... or 10-19, 20-29...)
    for (let i = 10; i < 70; i += interval) {
        groups.push(new AgeGroup({ min: i, max: i + interval - 1 }));
    }
    
    // 70+
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
      <p>No events available. Create events first.</p>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2>Award Configuration</h2>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <label>Select Event: </label>
        <select value={selectedID} onChange={e => setSelectedID(Number(e.target.value))}>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      {config && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="card">
            <h3>Standard Categories</h3>
            
            <section style={{ marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
              <label><input type="checkbox" checked={config.include_overall} onChange={e => setConfig({...config, include_overall: e.target.checked})} /> <strong>Overall</strong></label>
              {config.include_overall && (
                <div style={{ marginLeft: '20px' }}>Count: <input type="number" value={config.overall_count} onChange={e => setConfig({...config, overall_count: Number(e.target.value)})} style={{width: '80px'}} /></div>
              )}
            </section>

            <section style={{ marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
              <label><input type="checkbox" checked={config.include_masters} onChange={e => setConfig({...config, include_masters: e.target.checked})} /> <strong>Masters</strong></label>
              {config.include_masters && (
                <div style={{ marginLeft: '20px' }}>
                  Min Age: <input type="number" value={config.masters_age} onChange={e => setConfig({...config, masters_age: Number(e.target.value)})} style={{width: '80px'}} />
                  &nbsp; Count: <input type="number" value={config.masters_count} onChange={e => setConfig({...config, masters_count: Number(e.target.value)})} style={{width: '80px'}} />
                </div>
              )}
            </section>

            <section style={{ marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
              <label><input type="checkbox" checked={config.include_grand_masters} onChange={e => setConfig({...config, include_grand_masters: e.target.checked})} /> <strong>Grand Masters</strong></label>
              {config.include_grand_masters && (
                <div style={{ marginLeft: '20px' }}>
                  Min Age: <input type="number" value={config.grand_masters_age} onChange={e => setConfig({...config, grand_masters_age: Number(e.target.value)})} style={{width: '80px'}} />
                  &nbsp; Count: <input type="number" value={config.grand_masters_count} onChange={e => setConfig({...config, grand_masters_count: Number(e.target.value)})} style={{width: '80px'}} />
                </div>
              )}
            </section>

            <section style={{ marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
              <label><input type="checkbox" checked={config.include_senior_grand_masters} onChange={e => setConfig({...config, include_senior_grand_masters: e.target.checked})} /> <strong>Senior Grand Masters</strong></label>
              {config.include_senior_grand_masters && (
                <div style={{ marginLeft: '20px' }}>
                  Min Age: <input type="number" value={config.senior_grand_masters_age} onChange={e => setConfig({...config, senior_grand_masters_age: Number(e.target.value)})} style={{width: '80px'}} />
                  &nbsp; Count: <input type="number" value={config.senior_grand_masters_count} onChange={e => setConfig({...config, senior_grand_masters_count: Number(e.target.value)})} style={{width: '80px'}} />
                </div>
              )}
            </section>

            <section className="card" style={{ backgroundColor: '#ffffff05', marginTop: '20px' }}>
              <h4>Strategy & Logic</h4>
              <div style={{ marginBottom: '10px' }}>
                <select value={config.award_strategy} onChange={e => setConfig({...config, award_strategy: Number(e.target.value) as AwardStrategy})}>
                    <option value={AwardStrategy.AwardStrategyPrestigious}>Prestigious (Cascade)</option>
                    <option value={AwardStrategy.AwardStrategyDistributed}>Distributed</option>
                </select>
              </div>
              <p style={{ fontSize: '0.85em', color: 'var(--text-dim)', fontStyle: 'italic', lineHeight: '1.4' }}>
                {config.award_strategy === AwardStrategy.AwardStrategyPrestigious 
                    ? "Prestigious: Winners are pulled into the highest category they qualify for (Overall > Masters > Age Group). One trophy per person."
                    : "Distributed: Participants only win within their specific age group or the specific category they are assigned to."}
              </p>
              
              <div style={{ marginTop: '15px' }}>
                <label><input type="checkbox" checked={config.split_gender} onChange={e => setConfig({...config, split_gender: e.target.checked})} /> Split Awards by Gender</label>
              </div>
              <div style={{ marginTop: '10px' }}>
                Age Group Depth: <input type="number" value={config.age_group_depth} onChange={e => setConfig({...config, age_group_depth: Number(e.target.value)})} style={{width: '80px'}} />
                <span style={{ fontSize: '0.8em', color: 'var(--text-dim)', marginLeft: '10px' }}>(Winners per group)</span>
              </div>
            </section>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3>Age Groups</h3>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => generateAgeGroups(5)} style={{ padding: '4px 8px', fontSize: '0.8em', backgroundColor: '#444' }}>5-Year</button>
                    <button onClick={() => generateAgeGroups(10)} style={{ padding: '4px 8px', fontSize: '0.8em', backgroundColor: '#444' }}>10-Year</button>
                </div>
            </div>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '15px', border: '1px solid var(--border)' }}>
                <table style={{ width: '100%' }}>
                <thead>
                    <tr style={{ textAlign: 'left' }}><th>Min Age</th><th>Max Age</th><th style={{ textAlign: 'right' }}>Action</th></tr>
                </thead>
                <tbody>
                    {config.age_groups.map((ag, i) => (
                    <tr key={i}>
                        <td><input type="number" value={ag.min} onChange={e => updateAgeGroup(i, 'min', Number(e.target.value))} style={{width: '80px'}} /></td>
                        <td><input type="number" value={ag.max} onChange={e => updateAgeGroup(i, 'max', Number(e.target.value))} style={{width: '80px'}} /></td>
                        <td style={{ textAlign: 'right' }}>
                            <button onClick={() => removeAgeGroup(i)} style={{ padding: '2px 8px', backgroundColor: 'var(--danger)' }}>×</button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            
            <button onClick={addAgeGroup} style={{ width: '100%', backgroundColor: '#444', marginBottom: '10px' }}>+ Add Custom Row</button>
            <button onClick={handleSave} style={{ width: '100%', padding: '12px', fontSize: '1.1em' }}>Save Configuration</button>
          </div>
        </div>
      )}
    </div>
  );
};
