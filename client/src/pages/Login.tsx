//Login.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../services/api';

const Login = () => {
  const [authUrl, setAuthUrl] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already logged in
    const userId = localStorage.getItem('userId');
    if (userId) {
      navigate('/dashboard');
      return;
    }

    // Get Google auth URL
    auth.getGoogleAuthUrl()
      .then(response => {
        setAuthUrl(response.data.url);
      })
      .catch(error => {
        console.error('Failed to get auth URL:', error);
      });
  }, [navigate]);

  return (
    <div className="login-container">
      <h1>Manuscript Cloud</h1>
      <p>Organize your writing projects with Google Docs integration</p>
      {authUrl && (
        <a href={authUrl} className="login-button">
          Sign in with Google
        </a>
      )}
    </div>
  );
};

export default Login;