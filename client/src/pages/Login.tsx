import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../services/api';
import './Login.css';

const Login: React.FC = () => {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if already logged in
    const userId = localStorage.getItem('userId');
    if (userId) {
      navigate('/dashboard');
      return;
    }

    // Check if there's a userId in URL params (returning from OAuth)
    const params = new URLSearchParams(location.search);
    const newUserId = params.get('userId');

    if (newUserId) {
      localStorage.setItem('userId', newUserId);
      navigate('/dashboard');
      return;
    }

    // Get Google auth URL
    setIsLoading(true);
    auth.getGoogleAuthUrl()
      .then(response => {
        setAuthUrl(response.data.url);
        setIsLoading(false);
      })
      .catch(error => {
        console.error('Failed to get auth URL:', error);
        setError('Failed to connect to authentication service');
        setIsLoading(false);
      });
  }, [navigate, location]);

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Manuscript Cloud</h1>
        <p className="tagline">Organize your writing projects with Google Docs integration</p>
        
        {isLoading ? (
          <div className="loading">Loading authentication...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          <a href={authUrl} className="login-button">
            Sign in with Google
          </a>
        )}
        
        <div className="login-footer">
          <p>Seamlessly manage your manuscript with the power of Google Docs</p>
        </div>
      </div>
    </div>
  );
};

export default Login;