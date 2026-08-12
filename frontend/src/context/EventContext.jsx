import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../api/client";

const EventContext = createContext(null);

export function EventProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [activeEventId, setActiveEventId] = useState(
    Number(localStorage.getItem("awd_active_event")) || null
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/events");
      setEvents(res.data);
      if (!activeEventId && res.data.length > 0) {
        setActiveEventId(res.data[0].id);
      }
    } catch (e) {
      // not logged in yet — ignore
    } finally {
      setLoading(false);
    }
  }, [activeEventId]);

  useEffect(() => {
    if (localStorage.getItem("awd_token")) refresh();
    else setLoading(false);
  }, []);

  useEffect(() => {
    if (activeEventId) localStorage.setItem("awd_active_event", activeEventId);
  }, [activeEventId]);

  const activeEvent = events.find((e) => e.id === activeEventId) || null;

  return (
    <EventContext.Provider value={{ events, activeEvent, setActiveEventId, refresh, loading }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvent() {
  return useContext(EventContext);
}
