import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const NavBar = () => {
  const navigate = useNavigate();

  return (
    <div className="navbar">
      <button className="button" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <nav className="nav">
        <Link to="/dashboard">Home</Link>
        <Link to="/cases">Cases</Link>
        <Link to="/clients">Clients</Link>
        <Link to="/hearings">Hearings</Link>
        <Link to="/payments">Payments</Link>
        <Link to="/documents">Documents</Link>
      </nav>
    </div>
  );
};

export default NavBar;
