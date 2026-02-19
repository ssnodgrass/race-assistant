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
        alert("Global Settings Saved Successfully");
    } catch (e) {
        alert("Failed to save: " + e);
    }
  };

  if (loading) return (
    <div className="card">Loading settings...</div>
  );

  return (
    <div style={{ maxWidth: '800px' }}>
      <h2 style={{ marginBottom: 'var(--space-lg)' }}>Global Database Settings</h2>
      
      <div className="card" style={{ borderTop: '4px solid var(--accent)', margin: 0 }}>
        <h3>RunSignUp Credentials</h3>
        <p className="text-dim" style={{ fontSize: '0.9rem', marginBottom: 'var(--space-lg)' }}>
            These credentials are stored in your database file and will be used for all participant imports and result syncing across all races.
        </p>
        
        <div style={{ marginBottom: 'var(--space-md)' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>API KEY</label>
            <input 
                type="password" 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)} 
                placeholder="Enter RunSignUp API Key"
                style={{ width: '100%' }}
            />
        </div>
        
        <div style={{ marginBottom: 'var(--space-xl)' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85em', color: 'var(--text-dim)' }}>API SECRET</label>
            <input 
                type="password" 
                value={apiSecret} 
                onChange={e => setApiSecret(e.target.value)} 
                placeholder="Enter RunSignUp API Secret"
                style={{ width: '100%' }}
            />
        </div>
        
        <button onClick={handleSave} style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }}>Save Global Credentials</button>
      </div>
    </div>
  );
};
