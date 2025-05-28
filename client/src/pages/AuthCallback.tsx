import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const userId = params.get('userId');

    if (userId) {
      localStorage.setItem('userId', userId);
      navigate('/dashboard');
    } else {
      navigate('/');
    }
  }, [navigate, location]);

  return (
    <div>
      <p>Authenticating...</p>
    </div>
  );
};

export default AuthCallback;