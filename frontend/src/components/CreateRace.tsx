import React, { useState } from 'react';
import { RaceService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';
import { Race } from '../../bindings/github.com/ssnodgrass/race-assistant/models';

interface CreateRaceProps {
  onCreated: (race: Race) => void;
  onCancel: () => void;
}

export const CreateRace: React.FC<CreateRaceProps> = ({ onCreated, onCancel }) => {
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const race = new Race({ id: 0, name, date: new Date(date).toISOString() });
    RaceService.CreateRace(race)
      .then(onCreated)
      .catch(err => {
        console.error(err);
        alert("Failed to create race");
      });
  };

  return (
    <div className="card" style={{ maxWidth: '500px', margin: '0 auto' }}>
      <h1>Create New Race</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Race Name:</label>
          <input 
            style={{ width: '100%', padding: '8px' }}
            placeholder="e.g. Annual 5K Run" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            required 
          />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Date:</label>
          <input 
            type="date" 
            style={{ width: '100%', padding: '8px' }}
            value={date} 
            onChange={e => setDate(e.target.value)} 
            required 
          />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" style={{ flex: 1 }}>Create Race</button>
          <button type="button" onClick={onCancel} style={{ flex: 1, backgroundColor: '#666' }}>Cancel</button>
        </div>
      </form>
    </div>
  );
};
