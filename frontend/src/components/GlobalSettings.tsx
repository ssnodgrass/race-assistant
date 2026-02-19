import React, { useState, useEffect } from 'react';
import { SettingsService } from '../../bindings/github.com/ssnodgrass/race-assistant/services';

export const GlobalSettings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
        SettingsService.Get('rsu_api_key'),
        SettingsService.Get('rsu_api_secret')
    ]).then(([key, secret]) => {
        setApiKey(key || '');
        setApiSecret(secret || '');
        setLoading(false);
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
        await SettingsService.Set('rsu_api_key', apiKey);
        await SettingsService.Set('rsu_api_secret', apiSecret);
        alert("Global Settings Saved");
    } catch (e) {
        alert("Failed to save: " + e);
    }
  };

  if (loading) return <div className="card">Loading settings...</div>;

  return (
    <div style={{ maxWidth: '600px' }}>
      <h2>Global Database Settings</h2>
      <div className="card" style={{ borderTop: '4px solid var(--accent)' }}>
        <h3>RunSignUp Credentials</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9em' }}>
            These credentials will be used for all races in this database.
        </p>
        
        <div style={{ marginTop: '20px' }}>
            <label>API Key:</label><br/>
            <input 
                type="password" 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)} 
                style={{ width: '100%', marginBottom: '15px' }} 
                placeholder="Enter RunSignUp API Key"
            />
            
            <label>API Secret:</label><br/>
            <input 
                type="password" 
                value={apiSecret} 
                onChange={e => setApiSecret(e.target.value)} 
                style={{ width: '100%', marginBottom: '20px' }} 
                placeholder="Enter RunSignUp API Secret"
            />
            
            <button onClick={handleSave} style={{ width: '100%' }}>Save Global Credentials</button>
        </div>
      </div>
    </div>
  );
};
