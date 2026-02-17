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
                <div style={{ marginLeft: '20px' }}>Count: <input type="number" value={config.overall_count} onChange={e => setConfig({...config, overall_count: Number(e.target.value)})} style={{width: '50px'}} /></div>
              )}
            </section>

            <section style={{ marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
              <label><input type="checkbox" checked={config.include_masters} onChange={e => setConfig({...config, include_masters: e.target.checked})} /> <strong>Masters</strong></label>
              {config.include_masters && (
                <div style={{ marginLeft: '20px' }}>
                  Age: <input type="number" value={config.masters_age} onChange={e => setConfig({...config, masters_age: Number(e.target.value)})} style={{width: '50px'}} />
                  &nbsp; Count: <input type="number" value={config.masters_count} onChange={e => setConfig({...config, masters_count: Number(e.target.value)})} style={{width: '50px'}} />
                </div>
              )}
            </section>

            <section style={{ marginBottom: '15px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
              <label><input type="checkbox" checked={config.include_grand_masters} onChange={e => setConfig({...config, include_grand_masters: e.target.checked})} /> <strong>Grand Masters</strong></label>
              {config.include_grand_masters && (
                <div style={{ marginLeft: '20px' }}>
                  Age: <input type="number" value={config.grand_masters_age} onChange={e => setConfig({...config, grand_masters_age: Number(e.target.value)})} style={{width: '50px'}} />
                  &nbsp; Count: <input type="number" value={config.grand_masters_count} onChange={e => setConfig({...config, grand_masters_count: Number(e.target.value)})} style={{width: '50px'}} />
                </div>
              )}
            </section>

            <section style={{ marginBottom: '15px' }}>
              <label><input type="checkbox" checked={config.include_senior_grand_masters} onChange={e => setConfig({...config, include_senior_grand_masters: e.target.checked})} /> <strong>Senior Grand Masters</strong></label>
              {config.include_senior_grand_masters && (
                <div style={{ marginLeft: '20px' }}>
                  Age: <input type="number" value={config.senior_grand_masters_age} onChange={e => setConfig({...config, senior_grand_masters_age: Number(e.target.value)})} style={{width: '50px'}} />
                  &nbsp; Count: <input type="number" value={config.senior_grand_masters_count} onChange={e => setConfig({...config, senior_grand_masters_count: Number(e.target.value)})} style={{width: '50px'}} />
                </div>
              )}
            </section>

            <section className="card" style={{ backgroundColor: '#333' }}>
              <h4>Strategy</h4>
              <select value={config.award_strategy} onChange={e => setConfig({...config, award_strategy: Number(e.target.value) as AwardStrategy})}>
                <option value={AwardStrategy.AwardStrategyPrestigious}>Prestigious (Cascade Down)</option>
                <option value={AwardStrategy.AwardStrategyDistributed}>Distributed (Stay in Category)</option>
              </select>
              <br/><br/>
              <label><input type="checkbox" checked={config.split_gender} onChange={e => setConfig({...config, split_gender: e.target.checked})} /> Split by Gender</label>
              <br/>
              Age Group Depth: <input type="number" value={config.age_group_depth} onChange={e => setConfig({...config, age_group_depth: Number(e.target.value)})} style={{width: '50px'}} />
            </section>
          </div>

          <div className="card">
            <h3>Age Groups</h3>
            <button onClick={addAgeGroup}>+ Add Age Group</button>
            <table style={{ width: '100%', marginTop: '10px' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}><th>Min Age</th><th>Max Age</th><th>Action</th></tr>
              </thead>
              <tbody>
                {config.age_groups.map((ag, i) => (
                  <tr key={i}>
                    <td><input type="number" value={ag.min} onChange={e => updateAgeGroup(i, 'min', Number(e.target.value))} style={{width: '60px'}} /></td>
                    <td><input type="number" value={ag.max} onChange={e => updateAgeGroup(i, 'max', Number(e.target.value))} style={{width: '60px'}} /></td>
                    <td><button onClick={() => removeAgeGroup(i)} style={{ padding: '2px 8px', backgroundColor: '#a33' }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={handleSave} style={{ marginTop: '20px', width: '100%', padding: '10px', fontSize: '1.1em' }}>Save Configuration</button>
          </div>
        </div>
      )}
    </div>
  );
};
