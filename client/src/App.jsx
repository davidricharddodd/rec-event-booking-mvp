import React, { useState, useEffect, useRef } from 'react';

// Use empty string prefix in production (served from same port) or http://localhost:5000 in dev
const API_BASE = window.location.hostname === 'localhost' ? (window.location.port === '5173' ? 'http://localhost:5000' : '') : '';

export default function App() {
  // Navigation
  const [activeRole, setActiveRole] = useState('public'); // public, admin, staff, crm, emails
  
  // Public Site State
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDateId, setSelectedDateId] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [basket, setBasket] = useState(() => {
    try {
      const saved = localStorage.getItem('rec_basket');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse basket from localStorage:', e);
      return [];
    }
  });
  const [showBasketDrawer, setShowBasketDrawer] = useState(false);
  
  // Registration Form
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateFirstName, setDelegateFirstName] = useState('');
  const [delegateLastName, setDelegateLastName] = useState('');
  const [delegateOrg, setDelegateOrg] = useState('');
  const [delegatePhone, setDelegatePhone] = useState('');
  const [delegateDietary, setDelegateDietary] = useState('');
  const [delegateAccess, setDelegateAccess] = useState('');
  
  // Member Lookup Cache
  const [isMemberLoading, setIsMemberLoading] = useState(false);
  const [memberStatus, setMemberStatus] = useState('none'); // active, none
  const [dynamicsContactId, setDynamicsContactId] = useState(null);
  
  // Payment Flow
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [checkoutData, setCheckoutData] = useState(null);
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('123');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [confirmedBookings, setConfirmedBookings] = useState([]);
  
  // Admin Dashboard State
  const [adminSummary, setAdminSummary] = useState(null);
  const [selectedAdminDateId, setSelectedAdminDateId] = useState(null);
  const [adminAttendees, setAdminAttendees] = useState([]);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [adminTab, setAdminTab] = useState('overview'); // overview, reports
  const [adminReportData, setAdminReportData] = useState(null);
  const [refundingId, setRefundingId] = useState(null);
  
  // Staff Check-In Simulator State
  const [staffEvents, setStaffEvents] = useState([]);
  const [selectedStaffDateId, setSelectedStaffDateId] = useState('');
  const [staffAttendees, setStaffAttendees] = useState([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scanInputRef, setScanInputRef] = useState('');
  const [scanResult, setScanResult] = useState(null); // { success: bool, message: string }
  
  // CRM Log State
  const [crmLogs, setCrmLogs] = useState([]);
  
  // Email Queue State
  const [emails, setEmails] = useState([]);
  const [viewingEmail, setViewingEmail] = useState(null);

  // Expanded MVP States
  const [adminRole, setAdminRole] = useState('super_admin'); // super_admin, manager, viewer, readonly
  const [templates, setTemplates] = useState([]);
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [isStaffOnline, setIsStaffOnline] = useState(true);
  const [staffOfflineQueue, setStaffOfflineQueue] = useState([]);

  // Create Event Form States
  const [showEventCreator, setShowEventCreator] = useState(false);
  const [creatorTitle, setCreatorTitle] = useState('');
  const [creatorDesc, setCreatorDesc] = useState('');
  const [creatorCategoryId, setCreatorCategoryId] = useState('1');
  const [creatorType, setCreatorType] = useState('standalone');
  const [creatorStart, setCreatorStart] = useState('');
  const [creatorEnd, setCreatorEnd] = useState('');
  const [creatorLocation, setCreatorLocation] = useState('');
  const [creatorCapacity, setCreatorCapacity] = useState(100);
  const [creatorTickets, setCreatorTickets] = useState([]);

  // Sync basket to local storage
  useEffect(() => {
    localStorage.setItem('rec_basket', JSON.stringify(basket));
  }, [basket]);

  // Load events & categories initially
  useEffect(() => {
    fetchEvents();
    fetchCategories();
  }, []);

  // Poll for background simulator updates (emails & crm logs)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCRMLogs();
      fetchEmailQueue();
      if (activeRole === 'admin') fetchAdminSummary();
    }, 4000);
    return () => clearInterval(interval);
  }, [activeRole]);

  // Handle auto-update of attendees when date changes in admin drawer
  useEffect(() => {
    if (selectedAdminDateId) {
      fetchAdminAttendees(selectedAdminDateId);
    }
  }, [selectedAdminDateId]);

  // Handle auto-update of staff app attendees
  useEffect(() => {
    if (selectedStaffDateId) {
      fetchStaffAttendees(selectedStaffDateId);
    }
  }, [selectedStaffDateId]);

  // API Call Helpers
  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/events?status=published`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching events:', err);
      setEvents([]);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/categories`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setCategories([]);
    }
  };

  const fetchAdminSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/dashboard/summary`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setAdminSummary(data);
    } catch (err) {
      console.error('Error loading admin summary:', err);
    }
  };

  const fetchAdminAttendees = async (dateId) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/events/${dateId}/attendees`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setAdminAttendees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading admin attendees:', err);
      setAdminAttendees([]);
    }
  };

  const fetchAdminReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/reports`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setAdminReportData(data);
    } catch (err) {
      console.error('Error loading report data:', err);
    }
  };

  const fetchStaffEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/app/events`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setStaffEvents(arr);
      if (arr.length > 0 && !selectedStaffDateId) {
        setSelectedStaffDateId(arr[0].event_date_id);
      }
    } catch (err) {
      console.error('Error fetching staff events:', err);
      setStaffEvents([]);
    }
  };

  const fetchStaffAttendees = async (dateId) => {
    try {
      const res = await fetch(`${API_BASE}/api/app/events/${dateId}/attendees`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setStaffAttendees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading staff attendees:', err);
      setStaffAttendees([]);
    }
  };

  const fetchCRMLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/crm/logs`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setCrmLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading crm logs:', err);
      setCrmLogs([]);
    }
  };

  const fetchEmailQueue = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/email-queue`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading email queue:', err);
      setEmails([]);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/templates`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading templates:', err);
      setTemplates([]);
    }
  };

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    if (!discountCodeInput) return;
    setPromoError('');
    try {
      const res = await fetch(`${API_BASE}/api/discount/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCodeInput })
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoError(data.error);
        setAppliedPromo(null);
      } else {
        setAppliedPromo(data);
      }
    } catch (err) {
      setPromoError('Connection error validating promotional code.');
    }
  };

  const handlePromoteWaitlist = async (bookingId) => {
    if (adminRole === 'readonly') {
      alert('Action disabled in Read-Only mode.');
      return;
    }
    if (!confirm('Promote this delegate from the waitlist? This will confirm their booking.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/promote`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('Delegate promoted successfully!');
        fetchAdminAttendees(selectedAdminDateId);
        fetchAdminSummary();
      } else {
        alert(data.error || 'Failed to promote delegate.');
      }
    } catch (err) {
      console.error('Promotion error:', err);
    }
  };

  const handleGDPRVerifyErase = async (delegateId) => {
    if (adminRole === 'readonly') {
      alert('Action disabled in Read-Only mode.');
      return;
    }
    if (adminRole !== 'super_admin') {
      alert('GDPR Right to Erasure requires the Super Admin role.');
      return;
    }
    if (!confirm('WARNING: Are you sure you want to permanently anonymise this delegate under GDPR Article 17? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/delegates/${delegateId}/erase`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('GDPR Erasure completed successfully.');
        fetchAdminAttendees(selectedAdminDateId);
        fetchAdminSummary();
      } else {
        alert(data.error || 'Failed to execute GDPR erasure.');
      }
    } catch (err) {
      console.error('GDPR Erasure error:', err);
    }
  };

  const handleDownloadFinanceCSV = () => {
    window.open(`${API_BASE}/api/admin/reports/finance-csv`, '_blank');
  };

  const handleSyncOfflineQueue = async () => {
    if (staffOfflineQueue.length === 0) return;
    try {
      let successCount = 0;
      for (const item of staffOfflineQueue) {
        const res = await fetch(`${API_BASE}/api/app/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_reference: item.booking_reference, checked_in: item.checked_in })
        });
        if (res.ok) successCount++;
      }
      alert(`Offline sync complete! ${successCount} check-in updates pushed to Dynamics 365 CRM.`);
      setStaffOfflineQueue([]);
      fetchStaffAttendees(selectedStaffDateId);
    } catch (err) {
      console.error('Sync failed:', err);
      alert('Sync failed due to connection issues.');
    }
  };

  // Perform Dynamics CRM Member Lookup
  const handleEmailBlur = async () => {
    if (!delegateEmail || !delegateEmail.includes('@')) return;
    setIsMemberLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/membership/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: delegateEmail })
      });
      const data = await res.json();
      setMemberStatus(data.member_status);
      setDynamicsContactId(data.dynamics_contact_id);
    } catch (err) {
      console.error('CRM member check failed:', err);
    } finally {
      setIsMemberLoading(false);
    }
  };

  // Add Item to Shopping Basket
  const addToBasket = (event, date, ticketType) => {
    // Prevent duplicate events in basket
    const duplicate = basket.some(item => item.event_date_id === date.id);
    if (duplicate) {
      alert('You have already added a ticket for this event date to your basket.');
      return;
    }

    const item = {
      event_id: event.id,
      event_title: event.title,
      event_date_id: date.id,
      date_string: new Date(date.start_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      registration_type_id: ticketType.id,
      ticket_name: ticketType.name,
      price_pence: ticketType.price_pence,
      waitlist: ticketType.waitlist || false
    };

    setBasket([...basket, item]);
    setShowBasketDrawer(true);
    // Reset selections
    setSelectedTicketId('');
    setSelectedDateId('');
    setSelectedEvent(null);
  };

  // Remove Item from Basket
  const removeFromBasket = (dateId) => {
    setBasket(basket.filter(item => item.event_date_id !== dateId));
  };

  // Initiate Booking Checkout
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (basket.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delegate: {
            first_name: delegateFirstName,
            last_name: delegateLastName,
            email: delegateEmail,
            organisation: delegateOrg,
            phone: delegatePhone,
            dietary_requirements: delegateDietary,
            accessibility_needs: delegateAccess,
            member_status: memberStatus,
            dynamics_contact_id: dynamicsContactId
          },
          basketItems: basket,
          discountCode: appliedPromo?.code || null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Checkout failed: ${err.error}`);
        return;
      }

      const data = await res.json();
      setCheckoutData(data);
      setShowBasketDrawer(false);
      
      // If free checkout (£0) (either free ticket, promo code discount, or waitlist), confirm immediately
      if (data.total_amount_pence === 0) {
        confirmPayment(data);
      } else {
        setShowPaymentModal(true);
      }
    } catch (err) {
      console.error('Checkout error:', err);
    }
  };

  // Confirm Payment (Simulates Stripe webhook callback)
  const confirmPayment = async (checkoutResult) => {
    setPaymentProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/checkout/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripe_payment_intent_id: checkoutResult.stripe_payment_intent_id || 'free_booking',
          delegate_id: checkoutResult.delegate_id,
          bookings: checkoutResult.bookings
        })
      });

      if (res.ok) {
        setPaymentSuccess(true);
        setConfirmedBookings(checkoutResult.bookings);
        setBasket([]); // Clear shopping basket
        
        // Reset form
        setDelegateEmail('');
        setDelegateFirstName('');
        setDelegateLastName('');
        setDelegateOrg('');
        setDelegatePhone('');
        setDelegateDietary('');
        setDelegateAccess('');
        setMemberStatus('none');
        setDynamicsContactId(null);
        setAppliedPromo(null);
        setDiscountCodeInput('');
        
        // Refresh general listings
        fetchEvents();
      } else {
        alert('Payment verification failed on the server.');
      }
    } catch (err) {
      console.error('Payment confirmation failed:', err);
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Refund Admin Action
  const handleRefund = async (bookingId) => {
    if (!confirm('Are you sure you want to cancel this booking and process a full refund?')) return;
    setRefundingId(bookingId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/refund`, { method: 'POST' });
      if (res.ok) {
        alert('Refund processed and transaction marked as cancelled.');
        // Refresh details
        fetchAdminAttendees(selectedAdminDateId);
        fetchAdminSummary();
      } else {
        alert('Failed to process refund.');
      }
    } catch (err) {
      console.error('Refund error:', err);
    } finally {
      setRefundingId(null);
    }
  };

  // Toggle staff app attendance checkin
  const toggleStaffAttendance = async (bookingRef, checkedInState) => {
    const checkedInValue = checkedInState ? 1 : 0;
    if (!isStaffOnline) {
      // Offline mode: update state local UI optimistically
      setStaffAttendees(prev => prev.map(a => a.reference === bookingRef ? { ...a, checked_in: checkedInValue } : a));
      // Add or update queue (if already queued, update it; otherwise append)
      setStaffOfflineQueue(prev => {
        const existingIdx = prev.findIndex(item => item.booking_reference === bookingRef);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { booking_reference: bookingRef, checked_in: checkedInValue };
          return next;
        }
        return [...prev, { booking_reference: bookingRef, checked_in: checkedInValue }];
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/app/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_reference: bookingRef, checked_in: checkedInState })
      });
      if (res.ok) {
        fetchStaffAttendees(selectedStaffDateId);
      }
    } catch (err) {
      console.error('Checkin toggle failed:', err);
    }
  };

  // Simulate scanning QR Code
  const handleScanQR = async (e) => {
    e.preventDefault();
    if (!scanInputRef) return;

    if (!isStaffOnline) {
      // Simulate offline scan lookups
      const attendee = staffAttendees.find(a => a.reference === scanInputRef);
      if (!attendee) {
        setScanResult({ success: false, message: `Scan Refused: Reference "${scanInputRef}" not found in cached local roster.` });
        return;
      }
      if (attendee.checked_in === 1) {
        setScanResult({ success: false, message: `Warning: ${attendee.first_name} ${attendee.last_name} is already checked in.` });
        return;
      }
      
      // Mark checked in locally
      setStaffAttendees(prev => prev.map(a => a.reference === scanInputRef ? { ...a, checked_in: 1 } : a));
      setStaffOfflineQueue(prev => {
        const existingIdx = prev.findIndex(item => item.booking_reference === scanInputRef);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = { booking_reference: scanInputRef, checked_in: 1 };
          return next;
        }
        return [...prev, { booking_reference: scanInputRef, checked_in: 1 }];
      });
      setScanResult({ success: true, message: `Success (Offline cached)! ${attendee.first_name} ${attendee.last_name} checked in successfully.` });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/app/checkin/qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_payload: scanInputRef })
      });
      const data = await res.json();
      if (!res.ok) {
        setScanResult({ success: false, message: data.error });
      } else if (data.already_checked_in) {
        setScanResult({ success: false, message: `Warning: ${data.name} is already checked in for ${data.event_title}.` });
      } else {
        setScanResult({ success: true, message: `Success! ${data.name} checked in successfully for ${data.event_title} (${data.ticket_name}).` });
        fetchStaffAttendees(selectedStaffDateId);
      }
    } catch (err) {
      setScanResult({ success: false, message: 'Scan API connection error' });
    }
  };

  // Resolve CRM Conflict
  const handleCRMResolve = async (logId, selectedCrmContactId) => {
    try {
      const res = await fetch(`${API_BASE}/api/crm/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId, crm_contact_id: selectedCrmContactId })
      });
      if (res.ok) {
        alert('Conflict resolved. contact linked and bookings synced.');
        fetchCRMLogs();
      } else {
        alert('Resolve API error.');
      }
    } catch (err) {
      console.error('CRM Resolve error:', err);
    }
  };

  // Force Send Email
  const forceSendEmail = async (emailId) => {
    try {
      const res = await fetch(`${API_BASE}/api/email-queue/${emailId}/send`, { method: 'POST' });
      if (res.ok) {
        fetchEmailQueue();
      }
    } catch (err) {
      console.error('Email send failed:', err);
    }
  };
  // Create and Publish Event
  const handleCreateEventSubmit = async (e) => {
    e.preventDefault();
    if (adminRole === 'readonly') {
      alert('Action disabled in Read-Only mode.');
      return;
    }
    if (!creatorStart || !creatorEnd) {
      alert('Start and End dates are required.');
      return;
    }

    const eventData = {
      title: creatorTitle,
      description: creatorDesc,
      category_id: parseInt(creatorCategoryId, 10) || 1,
      type: creatorType,
      status: 'published',
      dates: [
        {
          start_datetime: creatorStart,
          end_datetime: creatorEnd,
          location: creatorLocation,
          capacity: parseInt(creatorCapacity, 10) || 100,
          registration_types: (creatorTickets || []).map(t => ({
            name: t.name,
            price_pence: parseInt(t.price_pence, 10) || 0,
            capacity: parseInt(t.capacity, 10) || parseInt(creatorCapacity, 10) || 100,
            is_member_only: t.is_member_only || 0
          }))
        }
      ]
    };

    try {
      const res = await fetch(`${API_BASE}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });
      const data = await res.json();
      if (res.ok) {
        alert('Event created and published successfully!');
        setShowEventCreator(false);
        // Reset form
        setCreatorTitle('');
        setCreatorDesc('');
        setCreatorCategoryId('1');
        setCreatorType('standalone');
        setCreatorStart('');
        setCreatorEnd('');
        setCreatorLocation('');
        setCreatorCapacity(100);
        setCreatorTickets([]);
        // Refresh listings
        fetchEvents();
        fetchAdminSummary();
      } else {
        alert(data.error || 'Failed to create event.');
      }
    } catch (err) {
      console.error('Error creating event:', err);
      alert('Error creating event.');
    }
  };

  return (
    <div className="app-container">
      {/* -------------------- ROLE SWITCHER NAVBAR -------------------- */}
      <nav className="role-switcher-nav">
        <div className="role-switcher-nav-left">
          <div className="role-switcher-title">
            <span className="logo-badge">REC</span>
            <span className="logo-text">Event Platform MVP</span>
          </div>
        </div>
        <div className="role-buttons">
          <button 
            className={`role-btn ${activeRole === 'public' ? 'active' : ''}`}
            onClick={() => setActiveRole('public')}
          >
            🌐 Public Site
          </button>
          <button 
            className={`role-btn ${activeRole === 'admin' ? 'active' : ''}`}
            onClick={() => { setActiveRole('admin'); fetchAdminSummary(); }}
          >
            👑 Admin Board
          </button>
          <button 
            className={`role-btn ${activeRole === 'staff' ? 'active' : ''}`}
            onClick={() => { setActiveRole('staff'); fetchStaffEvents(); }}
          >
            📱 Staff App
          </button>
          <button 
            className={`role-btn ${activeRole === 'crm' ? 'active' : ''}`}
            onClick={() => { setActiveRole('crm'); fetchCRMLogs(); }}
          >
            🔄 Dynamics CRM
          </button>
          <button 
            className={`role-btn ${activeRole === 'emails' ? 'active' : ''}`}
            onClick={() => { setActiveRole('emails'); fetchEmailQueue(); }}
          >
            ✉️ Email Queue
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {basket.length > 0 && activeRole === 'public' && (
            <button className="btn btn-primary" onClick={() => setShowBasketDrawer(true)} style={{ padding: '6px 12px', fontSize: '12px' }}>
              🛒 Basket ({basket.length})
            </button>
          )}
        </div>
      </nav>

      {/* -------------------- PUBLIC WEBSITE -------------------- */}
      {activeRole === 'public' && (
        <main style={{ flex: 1, padding: '40px 24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          {paymentSuccess ? (
            <div className="glass-card" style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center', borderColor: 'hsl(var(--success))' }}>
              <div style={{ fontSize: '48px', color: 'hsl(var(--success))', marginBottom: '16px' }}>✓</div>
              <h2 style={{ marginBottom: '12px' }}>Registration Complete!</h2>
              <p style={{ marginBottom: '24px' }}>Thank you for booking. Your tickets have been confirmed and receipt sent to your email.</p>
              
              <div style={{ background: 'rgba(2, 6, 23, 0.4)', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'left', border: '1px solid hsl(var(--border-glass))' }}>
                <h4 style={{ marginBottom: '12px' }}>Your Tickets:</h4>
                {confirmedBookings.map((b, idx) => (
                  <div key={idx} style={{ padding: '12px 0', borderBottom: idx < confirmedBookings.length - 1 ? '1px solid hsl(var(--border-glass))' : 'none', display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <img src={b.qr_code_b64} width="80" height="80" style={{ background: 'white', padding: '4px', borderRadius: '4px' }} alt="QR Code" />
                    <div>
                      <div style={{ fontWeight: '700' }}>{b.event_name}</div>
                      <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))' }}>Ref: <strong style={{ color: 'white' }}>{b.reference}</strong></div>
                      <div style={{ fontSize: '11px', color: 'hsl(var(--primary))', textTransform: 'uppercase', fontWeight: 'bold', marginTop: '2px' }}>REC Badge Ready</div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => setPaymentSuccess(false)}>
                Book More Events
              </button>
            </div>
          ) : selectedEvent ? (
            <div>
              <button className="btn btn-secondary" onClick={() => setSelectedEvent(null)} style={{ marginBottom: '24px' }}>
                ← Back to Calendar
              </button>
              
              <div className="grid-2">
                <div className="glass-card">
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <span className="badge" style={{ backgroundColor: selectedEvent.color_hex, color: 'white' }}>
                      {selectedEvent.category_name}
                    </span>
                    <span className="badge badge-outline" style={{ color: 'hsl(var(--text-secondary))' }}>
                      {selectedEvent.type}
                    </span>
                  </div>
                  <h1 style={{ marginBottom: '16px' }}>{selectedEvent.title}</h1>
                  <p style={{ fontSize: '16px', lineHeight: '1.6', marginBottom: '24px' }}>{selectedEvent.description}</p>
                </div>

                <div className="glass-card" style={{ height: 'fit-content' }}>
                  <h3 style={{ marginBottom: '16px' }}>Select Date & Ticket</h3>
                  
                  <div className="form-group">
                    <label className="form-label">Date & Session</label>
                    <select 
                      className="form-input" 
                      value={selectedDateId}
                      onChange={(e) => { setSelectedDateId(e.target.value); setSelectedTicketId(''); }}
                    >
                      <option value="">Select Date...</option>
                      {selectedEvent.dates?.map(d => (
                        <option key={d.id} value={d.id} disabled={d.status === 'full'}>
                          {new Date(d.start_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} ({d.location}) {d.status === 'full' ? '— FULL' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedDateId && (
                    <div style={{ marginTop: '20px' }}>
                      <h4 style={{ marginBottom: '12px', fontSize: '14px', color: 'hsl(var(--text-secondary))' }}>Available Tickets</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(selectedEvent.dates?.find(d => d.id === parseInt(selectedDateId))?.registration_types || []).map(t => {
                          const isSoldOut = t.sold_count >= t.capacity;
                          return (
                            <div 
                              key={t.id}
                              onClick={() => setSelectedTicketId(t.id.toString())}
                              style={{ 
                                padding: '16px', 
                                border: '1px solid',
                                borderColor: selectedTicketId === t.id.toString() 
                                  ? (isSoldOut ? 'hsl(var(--success))' : 'hsl(var(--primary))') 
                                  : 'hsl(var(--border-glass))',
                                background: selectedTicketId === t.id.toString() 
                                  ? (isSoldOut ? 'rgba(16, 185, 129, 0.15)' : 'var(--primary-glow)') 
                                  : 'rgba(2, 6, 23, 0.3)',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {t.name}
                                  {t.is_member_only === 1 && (
                                    <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Member Only</span>
                                  )}
                                  {isSoldOut && (
                                    <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Waitlist</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                                  {isSoldOut ? 'Capacity Full — Waitlist Active' : `${t.capacity - t.sold_count} seats remaining`}
                                </div>
                              </div>
                              <div style={{ fontSize: '18px', fontWeight: '800' }}>
                                {t.price_pence === 0 ? 'FREE' : `£${(t.price_pence / 100).toFixed(2)}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
 
                  {selectedTicketId && (() => {
                    const date = selectedEvent.dates?.find(d => d.id === parseInt(selectedDateId));
                    const ticket = date?.registration_types?.find(t => t.id === parseInt(selectedTicketId));
                    const isWaitlist = ticket ? ticket.sold_count >= ticket.capacity : false;
                    return (
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          addToBasket(selectedEvent, date, { ...ticket, waitlist: isWaitlist });
                        }}
                        style={{ 
                          width: '100%', 
                          marginTop: '24px', 
                          padding: '14px', 
                          background: isWaitlist ? 'hsl(var(--success))' : 'hsl(var(--primary))',
                          borderColor: isWaitlist ? 'hsl(var(--success))' : 'hsl(var(--primary))'
                        }}
                      >
                        {isWaitlist ? 'Join Event Waitlist' : 'Add Ticket to Basket'}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <h1 style={{ fontSize: '36px', marginBottom: '12px' }}>REC Events Calendar</h1>
                <p style={{ maxWidth: '600px', margin: '0 auto' }}>Find and register for REC seminars, CPD training workshops, Legal Helplines, and the Annual Conference.</p>
              </div>

              <div className="grid-3">
                {(events || []).map(event => {
                  const firstDate = event.dates?.[0];
                  const formattedDate = firstDate ? new Date(firstDate.start_datetime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                  return (
                    <div key={event.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <span className="badge" style={{ backgroundColor: event.color_hex, color: 'white' }}>
                          {event.category_name}
                        </span>
                        <span className="badge badge-outline" style={{ color: 'hsl(var(--text-secondary))' }}>
                          {event.type}
                        </span>
                      </div>
                      <h3 style={{ marginBottom: '12px', fontSize: '18px', lineHeight: '1.4' }}>{event.title}</h3>
                      <p style={{ fontSize: '13px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '20px', flex: 1 }}>
                        {event.description}
                      </p>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid hsl(var(--border-glass))', paddingTop: '16px', marginTop: 'auto' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'hsl(var(--text-muted))', textTransform: 'uppercase' }}>Next Date</div>
                          <div style={{ fontSize: '13px', fontWeight: '700' }}>{formattedDate || 'Multiple Sessions'}</div>
                        </div>
                        <button className="btn btn-secondary" onClick={() => setSelectedEvent(event)}>
                          Book Event
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* -------------------- SHOPPING BASKET DRAWER -------------------- */}
      {showBasketDrawer && (
        <div className="drawer-backdrop" onClick={() => setShowBasketDrawer(false)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Shopping Basket</h2>
              <button onClick={() => setShowBasketDrawer(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            {basket.length === 0 ? (
              <p>Your basket is empty.</p>
            ) : (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                  {basket.map((item, idx) => (
                    <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid hsl(var(--border-glass))', position: 'relative' }}>
                      <button 
                        onClick={() => removeFromBasket(item.event_date_id)}
                        style={{ position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', fontSize: '16px' }}
                      >
                        ×
                      </button>
                      <div style={{ fontWeight: '700', paddingRight: '20px' }}>{item.event_title}</div>
                      <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', marginTop: '4px' }}>Date: {item.date_string}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                        <span style={{ fontSize: '12px', color: item.waitlist ? 'hsl(var(--success))' : 'hsl(var(--primary))', fontWeight: 'bold' }}>
                          {item.ticket_name} {item.waitlist && '(Waitlist)'}
                        </span>
                        <span style={{ fontWeight: '800' }}>
                          {item.waitlist ? 'FREE (Waitlist)' : (item.price_pence === 0 ? 'FREE' : `£${(item.price_pence / 100).toFixed(2)}`)}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Promo Code Input */}
                  <div style={{ borderTop: '1px solid hsl(var(--border-glass))', paddingTop: '16px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        placeholder="Promotional Code (e.g. REC20)" 
                        className="form-input" 
                        style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                        value={discountCodeInput}
                        onChange={(e) => setDiscountCodeInput(e.target.value)}
                      />
                      <button type="button" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={handleApplyPromo}>Apply</button>
                    </div>
                    {appliedPromo && (
                      <div style={{ color: 'hsl(var(--success))', fontSize: '12px', marginTop: '6px' }}>
                        ✓ Code Applied: <strong>{appliedPromo.code}</strong> ({appliedPromo.value}% Discount)
                      </div>
                    )}
                    {promoError && (
                      <div style={{ color: 'hsl(var(--error))', fontSize: '12px', marginTop: '6px' }}>
                        ✗ {promoError}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0', borderTop: '2px solid hsl(var(--border-glass))', marginTop: '16px' }}>
                    {appliedPromo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'hsl(var(--text-secondary))' }}>
                        <span>Subtotal:</span>
                        <span>£{(basket.reduce((acc, item) => acc + (item.waitlist ? 0 : item.price_pence), 0) / 100).toFixed(2)}</span>
                      </div>
                    )}
                    {appliedPromo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'hsl(var(--success))' }}>
                        <span>Discount ({appliedPromo.value}%):</span>
                        <span>-£{((basket.reduce((acc, item) => acc + (item.waitlist ? 0 : item.price_pence), 0) * (appliedPromo.value / 100)) / 100).toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800' }}>
                      <span>Total Cost:</span>
                      <span>
                        £{((basket.reduce((acc, item) => acc + (item.waitlist ? 0 : item.price_pence), 0) * (appliedPromo ? 1 - appliedPromo.value / 100 : 1)) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleCheckoutSubmit} style={{ borderTop: '1px solid hsl(var(--border-glass))', paddingTop: '24px' }}>
                  <h3 style={{ marginBottom: '16px' }}>Delegate Information</h3>
                  
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="email" 
                        className="form-input" 
                        required 
                        style={{ width: '100%', paddingRight: '32px' }}
                        value={delegateEmail}
                        onChange={(e) => setDelegateEmail(e.target.value)}
                        onBlur={handleEmailBlur}
                      />
                      {isMemberLoading && <span style={{ position: 'absolute', right: '10px', top: '10px', fontSize: '12px' }}>🌀</span>}
                    </div>
                    {memberStatus === 'active' && (
                      <div style={{ color: 'hsl(var(--success))', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        ✓ Active REC Member details detected. member pricing tiers unlocked.
                      </div>
                    )}
                  </div>

                  <div className="grid-2" style={{ gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">First Name</label>
                      <input type="text" className="form-input" required value={delegateFirstName} onChange={(e) => setDelegateFirstName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Last Name</label>
                      <input type="text" className="form-input" required value={delegateLastName} onChange={(e) => setDelegateLastName(e.target.value)} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Organisation</label>
                    <input type="text" className="form-input" required value={delegateOrg} onChange={(e) => setDelegateOrg(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="text" className="form-input" value={delegatePhone} onChange={(e) => setDelegatePhone(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dietary Requirements (Optional)</label>
                    <input type="text" className="form-input" placeholder="e.g. Vegetarian, Gluten Free" value={delegateDietary} onChange={(e) => setDelegateDietary(e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Accessibility Requirements (Optional)</label>
                    <input type="text" className="form-input" value={delegateAccess} onChange={(e) => setDelegateAccess(e.target.value)} />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px', padding: '12px' }}>
                    Proceed to Payment
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* -------------------- MOCK STRIPE CREDIT CARD PAYMENT MODAL -------------------- */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '480px', borderColor: 'hsl(var(--primary))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>💳</span>
                <h3 style={{ fontSize: '18px' }}>Stripe Checkout</h3>
              </div>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid hsl(var(--border-glass))', marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))' }}>Merchant: <strong style={{ color: 'white' }}>Recruitment & Employment Confederation (REC)</strong></div>
              <div style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px', color: 'hsl(var(--primary))' }}>
                £{(checkoutData?.total_amount_pence / 100).toFixed(2)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div className="form-group">
                <label className="form-label">Card Number</label>
                <input type="text" className="form-input" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
              </div>
              <div className="grid-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Expiry Date</label>
                  <input type="text" className="form-input" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">CVC</label>
                  <input type="text" className="form-input" value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '12px' }}
                disabled={paymentProcessing}
                onClick={() => {
                  setShowPaymentModal(false);
                  confirmPayment(checkoutData);
                }}
              >
                {paymentProcessing ? 'Processing...' : 'Pay Success'}
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, color: 'hsl(var(--error))', borderColor: 'hsl(var(--error-glow))' }}
                onClick={() => {
                  alert('Simulated Card declined.');
                  setShowPaymentModal(false);
                }}
              >
                Simulate Decline
              </button>
            </div>
            
            <div style={{ fontSize: '10px', color: 'hsl(var(--text-muted))', textAlign: 'center', marginTop: '16px' }}>
              🔒 PCI-DSS Compliant Gateway. Powered by Stripe.
            </div>
          </div>
        </div>
      )}

      {/* -------------------- ADMIN DASHBOARD -------------------- */}
      {activeRole === 'admin' && (
        <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1>REC Operations Center</h1>
              <p>Manage events, monitor live checkout conversions, check sync status, and pull reports.</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))' }}>Current RBAC Role:</span>
              <select 
                className="form-input" 
                style={{ padding: '6px 12px', fontSize: '13px', width: 'fit-content' }}
                value={adminRole}
                onChange={(e) => {
                  const role = e.target.value;
                  setAdminRole(role);
                  if (role === 'viewer') {
                    setAdminTab('reports');
                    fetchAdminReports();
                  } else {
                    setAdminTab('overview');
                  }
                }}
              >
                <option value="super_admin">Super Admin</option>
                <option value="manager">Events Manager</option>
                <option value="viewer">Reporting Viewer (Read-only Finance)</option>
                <option value="readonly">Read-Only Viewer</option>
              </select>
            </div>

            <div className="tab-list" style={{ borderBottom: 'none', marginBottom: 0, width: '100%', display: 'flex', gap: '8px' }}>
              {adminRole !== 'viewer' && (
                <button className={`tab-btn ${adminTab === 'overview' ? 'active' : ''}`} onClick={() => setAdminTab('overview')}>
                  Overview & Events
                </button>
              )}
              {adminRole !== 'viewer' && (
                <button className={`tab-btn ${adminTab === 'templates' ? 'active' : ''}`} onClick={() => { setAdminTab('templates'); fetchTemplates(); }}>
                  Event Creator & Templates
                </button>
              )}
              <button className={`tab-btn ${adminTab === 'reports' ? 'active' : ''}`} onClick={() => { setAdminTab('reports'); fetchAdminReports(); }}>
                Performance Analytics
              </button>
            </div>
          </div>

          {adminTab === 'overview' && adminRole !== 'viewer' && (
            <div>
              {/* Metric Statistics Row */}
              {adminSummary && (
                <div className="grid-4" style={{ marginBottom: '32px' }}>
                  <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Revenue</div>
                    <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', color: 'hsl(var(--primary))' }}>
                      £{(adminSummary.stats.total_revenue_pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', fontWeight: 'bold' }}>New Signups Today</div>
                    <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', color: 'white' }}>
                      {adminSummary.stats.registrations_today}
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', fontWeight: 'bold' }}>Active Bookings</div>
                    <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', color: 'hsl(var(--success))' }}>
                      {adminSummary.stats.total_registrations}
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '20px' }}>
                    <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', textTransform: 'uppercase', fontWeight: 'bold' }}>Published Events</div>
                    <div style={{ fontSize: '28px', fontWeight: '800', marginTop: '8px', color: 'hsl(var(--warning))' }}>
                      {adminSummary.stats.active_events}
                    </div>
                  </div>
                </div>
              )}

              {/* Needs Attention Panel */}
              {adminSummary?.needsAttention && adminSummary.needsAttention.length > 0 && (
                <div className="glass-card" style={{ borderColor: 'hsl(var(--warning))', background: 'var(--warning-glow)', marginBottom: '32px' }}>
                  <h3 style={{ color: 'hsl(var(--warning))', marginBottom: '8px', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚠️ Events Needing Marketing Attention (Low Ticket Sales)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {adminSummary.needsAttention?.map((e, idx) => (
                      <div key={idx} style={{ fontSize: '14px', display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: idx < adminSummary.needsAttention.length - 1 ? '1px dashed rgba(245,158,11,0.2)' : 'none' }}>
                        <span><strong>{e.title}</strong> — Starting {new Date(e.start_datetime).toLocaleDateString()}</span>
                        <span>Ticket Sales: {e.sold_count} / {e.capacity} sold</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Events Table */}
              <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid hsl(var(--border-glass))' }}>
                      <th style={{ padding: '16px 24px' }}>Event Name</th>
                      <th style={{ padding: '16px' }}>Category</th>
                      <th style={{ padding: '16px' }}>Format</th>
                      <th style={{ padding: '16px' }}>Sales Status</th>
                      <th style={{ padding: '16px', textAlign: 'right' }}>Roster</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSummary?.events?.map((event) => (
                      <tr key={event.id} style={{ borderBottom: '1px solid hsl(var(--border-glass))' }}>
                        <td style={{ padding: '16px 24px', fontWeight: 'bold' }}>{event.title}</td>
                        <td style={{ padding: '16px' }}>
                          <span className="badge" style={{ backgroundColor: event.color_hex, color: 'white' }}>{event.category_name}</span>
                        </td>
                        <td style={{ padding: '16px', textTransform: 'capitalize' }}>{event.type}</td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, minWidth: '80px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, (event.total_sold / event.total_capacity) * 100)}%`, height: '100%', background: 'hsl(var(--primary))' }}></div>
                            </div>
                            <span style={{ fontSize: '12px' }}>{event.total_sold} / {event.total_capacity}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <select 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                            onChange={(e) => {
                              if (e.target.value) {
                                setSelectedAdminDateId(e.target.value);
                                setShowAdminDrawer(true);
                              }
                            }}
                          >
                            <option value="">View Session...</option>
                            {event.dates?.map(d => (
                              <option key={d.id} value={d.id}>
                                {new Date(d.start_datetime).toLocaleDateString()} ({d.location.slice(0, 15)}...)
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === 'templates' && adminRole !== 'viewer' && (
            <div>
              {showEventCreator ? (
                /* Event Creator Editor Form */
                <form onSubmit={handleCreateEventSubmit} className="glass-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                  <h2 style={{ marginBottom: '24px' }}>Create and Publish Event</h2>
                  
                  <div className="form-group">
                    <label className="form-label">Event Title *</label>
                    <input type="text" className="form-input" required value={creatorTitle} onChange={(e) => setCreatorTitle(e.target.value)} disabled={adminRole === 'readonly'} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Event Description</label>
                    <textarea className="form-input" style={{ minHeight: '100px' }} value={creatorDesc} onChange={(e) => setCreatorDesc(e.target.value)} disabled={adminRole === 'readonly'} />
                  </div>

                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Category *</label>
                      <select className="form-input" value={creatorCategoryId} onChange={(e) => setCreatorCategoryId(e.target.value)} disabled={adminRole === 'readonly'}>
                        <option value="1">Conference</option>
                        <option value="2">Webinar</option>
                        <option value="3">Legal Helpline Q&A</option>
                        <option value="4">CPD Workshop</option>
                        <option value="5">Qualification</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Format Type *</label>
                      <select className="form-input" value={creatorType} onChange={(e) => setCreatorType(e.target.value)} disabled={adminRole === 'readonly'}>
                        <option value="standalone">Standalone (Single occurrence)</option>
                        <option value="umbrella">Umbrella (Series event)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Start Date & Time *</label>
                      <input type="datetime-local" className="form-input" required value={creatorStart} onChange={(e) => setCreatorStart(e.target.value)} disabled={adminRole === 'readonly'} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Date & Time *</label>
                      <input type="datetime-local" className="form-input" required value={creatorEnd} onChange={(e) => setCreatorEnd(e.target.value)} disabled={adminRole === 'readonly'} />
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Location / Link *</label>
                      <input type="text" placeholder="e.g. Virtual (MS Teams) or Address" className="form-input" required value={creatorLocation} onChange={(e) => setCreatorLocation(e.target.value)} disabled={adminRole === 'readonly'} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Default Capacity *</label>
                      <input type="number" className="form-input" required value={creatorCapacity} onChange={(e) => setCreatorCapacity(e.target.value)} disabled={adminRole === 'readonly'} />
                    </div>
                  </div>

                  <div style={{ marginTop: '24px', borderTop: '1px solid hsl(var(--border-glass))', paddingTop: '24px' }}>
                    <h4 style={{ marginBottom: '16px' }}>Pre-Configured Tickets (Template Defaults)</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {creatorTickets.map((t, idx) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', borderRadius: '8px', border: '1px solid hsl(var(--border-glass))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: 'bold' }}>{t.name}</span>
                            {t.is_member_only === 1 && (
                              <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', marginLeft: '8px' }}>Member Only</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <span>Price: <strong>{t.price_pence === 0 ? 'FREE' : `£${(t.price_pence / 100).toFixed(2)}`}</strong></span>
                            <span>Capacity: <strong>{t.capacity}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
                    <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={adminRole === 'readonly'}>
                      Publish Live Event
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowEventCreator(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* Templates List Card Grid */
                <div>
                  <h3 style={{ marginBottom: '16px' }}>Choose a Template to Fast-Track Event Creation</h3>
                  <p style={{ marginBottom: '24px', color: 'hsl(var(--text-secondary))' }}>Selecting a template snapshots default pricing structures, member eligibility tags, and visibility settings so you can publish in under 5 minutes.</p>
                  
                  <div className="grid-3">
                    {templates.map(t => {
                      const config = JSON.parse(t.config_json || '{}');
                      return (
                        <div key={t.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }}>
                              {t.category_name}
                            </span>
                            <span className="badge badge-outline" style={{ color: 'hsl(var(--primary))' }}>
                              {t.event_type}
                            </span>
                          </div>
                          <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>{t.name}</h3>
                          <p style={{ fontSize: '13px', color: 'hsl(var(--text-secondary))', marginBottom: '20px', flex: 1 }}>{t.default_description}</p>
                          
                          <div style={{ background: 'rgba(2, 6, 23, 0.4)', padding: '12px', borderRadius: '8px', border: '1px solid hsl(var(--border-glass))', marginBottom: '20px', fontSize: '12px' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '6px', color: 'hsl(var(--text-muted))' }}>Default Tiers:</div>
                            {config.registration_types?.map((rt, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                <span>{rt.name}</span>
                                <strong>{rt.price_pence === 0 ? 'FREE' : `£${(rt.price_pence / 100).toFixed(0)}`}</strong>
                              </div>
                            ))}
                          </div>

                          <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', marginTop: 'auto' }}
                            onClick={() => {
                              setCreatorTitle(t.default_title);
                              setCreatorDesc(t.default_description);
                              setCreatorCategoryId(t.category_id.toString());
                              setCreatorType(t.event_type);
                              setCreatorTickets(config.registration_types || []);
                              setShowEventCreator(true);
                            }}
                          >
                            Use Template
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {adminTab === 'reports' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '24px' }}>
                <button className="btn btn-primary" onClick={handleDownloadFinanceCSV}>
                  📥 Export Daily Finance Report (CSV)
                </button>
              </div>

              <div className="grid-2">
                <div className="glass-card">
                  <h3 style={{ marginBottom: '16px' }}>Revenue Contribution by Category</h3>
                  {adminReportData?.revenueByCategory.length === 0 ? (
                    <p>No paid registrations yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {adminReportData?.revenueByCategory?.map((c, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                            <span>{c.category}</span>
                            <strong>£{(c.revenue_pence / 100).toFixed(2)}</strong>
                          </div>
                          <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: '100%', height: '100%', background: 'hsl(var(--primary))' }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-card">
                  <h3 style={{ marginBottom: '16px' }}>Audit Attendance & Check-in Rates</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {adminReportData?.attendanceStats?.map((e, idx) => {
                      const attendedRate = e.sold_count > 0 ? (e.checked_in / e.sold_count) * 100 : 0;
                      return (
                        <div key={idx} style={{ paddingBottom: '12px', borderBottom: idx < adminReportData.attendanceStats.length - 1 ? '1px solid hsl(var(--border-glass))' : 'none' }}>
                          <div style={{ fontWeight: '700', fontSize: '14px' }}>{e.title}</div>
                          <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>
                            Date: {new Date(e.start_datetime).toLocaleDateString()}
                          </div>
                          <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                            <div style={{ fontSize: '13px' }}>✅ Checked-in: <strong>{e.checked_in}</strong></div>
                            <div style={{ fontSize: '13px' }}>⏳ No-Shows: <strong>{e.no_show}</strong></div>
                            <div style={{ fontSize: '13px', color: 'hsl(var(--primary))' }}>Check-in Rate: <strong>{attendedRate.toFixed(0)}%</strong></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* -------------------- ADMIN DRAWER (ATTENDEES / REFUNDS) -------------------- */}
      {showAdminDrawer && (
        <div className="drawer-backdrop" onClick={() => setShowAdminDrawer(false)}>
          <div className="drawer-content" style={{ maxWidth: '650px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2>Attendee Roster & Management</h2>
              <button onClick={() => setShowAdminDrawer(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(!adminAttendees || adminAttendees.length === 0) ? (
                <p>No delegates registered for this session.</p>
              ) : (
                adminAttendees.map((a) => (
                  <div 
                    key={a.booking_id} 
                    style={{ 
                      background: 'rgba(2, 6, 23, 0.4)', 
                      padding: '16px', 
                      borderRadius: '12px', 
                      border: '1px solid',
                      borderColor: a.booking_status === 'cancelled' ? 'rgba(239, 68, 68, 0.2)' : 'hsl(var(--border-glass))',
                      opacity: a.booking_status === 'cancelled' ? 0.6 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '16px' }}>{a.first_name} {a.last_name}</div>
                        <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', marginTop: '2px' }}>{a.organisation || 'N/A'} | {a.email}</div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                          <span className="badge badge-outline" style={{ color: 'hsl(var(--primary))', fontSize: '10px' }}>{a.ticket_name}</span>
                          <span className="badge" style={{ backgroundColor: a.checked_in === 1 ? 'hsl(var(--success))' : 'rgba(255,255,255,0.05)', color: 'white', fontSize: '10px' }}>
                            {a.checked_in === 1 ? 'Checked In' : 'Not Present'}
                          </span>
                          {a.booking_status === 'waitlisted' && (
                            <span className="badge" style={{ backgroundColor: 'hsl(var(--warning))', color: 'black', fontSize: '10px', fontWeight: 'bold' }}>Waitlisted</span>
                          )}
                          {a.booking_status === 'cancelled' && (
                            <span className="badge" style={{ backgroundColor: 'hsl(var(--error))', color: 'white', fontSize: '10px' }}>Cancelled</span>
                          )}
                          {a.crm_synced && (
                            <span style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '2px 6px', borderRadius: '4px' }}>CRM Synced</span>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {a.booking_status === 'waitlisted' && (adminRole === 'super_admin' || adminRole === 'manager') && (
                          <button 
                            className="btn btn-success"
                            style={{ padding: '6px 12px', fontSize: '11px' }}
                            onClick={() => handlePromoteWaitlist(a.booking_id)}
                          >
                            Promote
                          </button>
                        )}
                        
                        {a.booking_status !== 'cancelled' && a.booking_status !== 'waitlisted' && (adminRole === 'super_admin' || adminRole === 'manager') && (
                          <button 
                            className="btn btn-danger"
                            style={{ padding: '6px 12px', fontSize: '11px' }}
                            disabled={refundingId === a.booking_id}
                            onClick={() => handleRefund(a.booking_id)}
                          >
                            {refundingId === a.booking_id ? 'Refunding...' : 'Refund & Cancel'}
                          </button>
                        )}

                        {adminRole === 'super_admin' && a.first_name !== '[ANONYMIZED_GDPR]' && (
                          <button 
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '11px', borderColor: 'hsl(var(--error))', color: 'hsl(var(--error))' }}
                            onClick={() => handleGDPRVerifyErase(a.delegate_id)}
                          >
                            GDPR Erase
                          </button>
                        )}
                      </div>
                    </div>

                    {(a.dietary_requirements || a.accessibility_needs) && (
                      <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        {a.dietary_requirements && <div>🍽️ <strong>Dietary:</strong> {a.dietary_requirements}</div>}
                        {a.accessibility_needs && <div style={{ marginTop: '4px' }}>♿ <strong>Access:</strong> {a.accessibility_needs}</div>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------- STAFF CHECK-IN APP SIMULATOR -------------------- */}
      {activeRole === 'staff' && (
        <main style={{ flex: 1, padding: '32px 24px' }}>
          <div className="mobile-device-frame">
            <div className="mobile-device-notch"></div>
            <div className="mobile-device-screen">
              <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '1px solid hsl(var(--border-glass))', paddingBottom: '12px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'hsl(var(--primary))', fontWeight: 'bold' }}>REC Staff Check-in</div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: 'white', marginTop: '2px' }}>Arrivals Portal</div>
                
                {/* Network Online/Offline Simulator Switch */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
                  <span style={{ color: isStaffOnline ? 'hsl(var(--success))' : 'hsl(var(--text-muted))', fontWeight: 'bold' }}>
                    {isStaffOnline ? '● Online (Dynamics Sync)' : '○ Offline Mode'}
                  </span>
                  <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '34px', height: '20px' }}>
                    <input 
                      type="checkbox" 
                      checked={isStaffOnline} 
                      onChange={(e) => {
                        const val = e.target.checked;
                        setIsStaffOnline(val);
                        if (val) {
                          // When toggling online, fetch latest updates
                          fetchStaffEvents();
                          if (selectedStaffDateId) fetchStaffAttendees(selectedStaffDateId);
                        }
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: isStaffOnline ? 'hsl(var(--success))' : '#475569',
                      transition: '.4s', borderRadius: '20px'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '14px', width: '14px', left: isStaffOnline ? '17px' : '3px', bottom: '3px',
                        backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              {showScanner ? (
                /* Simulated QR Scanner */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', borderRadius: '16px', padding: '20px', position: 'relative' }}>
                  <div style={{ border: '2px dashed hsl(var(--primary))', width: '220px', height: '220px', margin: '40px auto 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ color: 'hsl(var(--primary))', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                      Aim camera at delegate badge QR code
                    </div>
                  </div>

                  <form onSubmit={handleScanQR} style={{ marginTop: 'auto' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ color: '#ccc' }}>Simulate Scan Input (Booking Ref)</label>
                      <input 
                        type="text" 
                        placeholder="REC-XXXXXX"
                        className="form-input" 
                        style={{ background: '#1e293b' }}
                        value={scanInputRef}
                        onChange={(e) => setScanInputRef(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Submit Scan</button>
                      <button type="button" className="btn btn-secondary" onClick={() => { setShowScanner(false); setScanResult(null); }}>Back</button>
                    </div>
                  </form>

                  {scanResult && (
                    <div 
                      style={{ 
                        position: 'absolute', 
                        top: 0, left: 0, right: 0, bottom: 0, 
                        background: scanResult.success ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
                        zIndex: 20, 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '24px', textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '48px', color: 'white', marginBottom: '16px' }}>
                        {scanResult.success ? '✓' : '✗'}
                      </div>
                      <h3 style={{ color: 'white', marginBottom: '12px' }}>
                        {scanResult.success ? 'Check-in Confirmed' : 'Scan Refused'}
                      </h3>
                      <p style={{ color: 'white', fontSize: '14px', marginBottom: '24px' }}>{scanResult.message}</p>
                      <button className="btn btn-secondary" style={{ background: 'white', color: 'black' }} onClick={() => { setScanResult(null); setScanInputRef(''); }}>
                        Scan Next
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard List checkin */
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="form-label">Active Session</label>
                    <select 
                      className="form-input"
                      value={selectedStaffDateId}
                      onChange={(e) => setSelectedStaffDateId(e.target.value)}
                    >
                      {staffEvents?.map(e => (
                        <option key={e.event_date_id} value={e.event_date_id}>
                          {e.title} ({new Date(e.start_datetime).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <input 
                      type="text" 
                      placeholder="Search attendee by name..." 
                      className="form-input"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                    />
                    <button className="btn btn-primary" onClick={() => setShowScanner(true)} style={{ padding: '8px 12px' }}>
                      📷 Scan
                    </button>
                  </div>

                  {staffOfflineQueue.length > 0 && (
                    <div style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '12px'
                    }}>
                      <span style={{ color: 'hsl(var(--warning))', fontWeight: 'bold' }}>
                        ⚠️ {staffOfflineQueue.length} Check-in(s) Cached Offline
                      </span>
                      {isStaffOnline && (
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '4px 8px', fontSize: '11px', background: 'hsl(var(--warning))', borderColor: 'hsl(var(--warning))', color: 'black', fontWeight: 'bold' }}
                          onClick={handleSyncOfflineQueue}
                        >
                          Sync Now
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(staffAttendees || [])
                      .filter(a => `${a.first_name} ${a.last_name}`.toLowerCase().includes(staffSearchQuery.toLowerCase()))
                      .map(a => (
                        <div 
                          key={a.booking_id} 
                          style={{ 
                            background: 'rgba(255,255,255,0.02)', 
                            border: '1px solid hsl(var(--border-glass))', 
                            padding: '12px', 
                            borderRadius: '12px', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center' 
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '13px' }}>{a.first_name} {a.last_name}</div>
                            <div style={{ fontSize: '11px', color: 'hsl(var(--text-muted))' }}>{a.ticket_name} | {a.reference}</div>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={a.checked_in === 1}
                            onChange={(e) => toggleStaffAttendance(a.reference, e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'hsl(var(--success))' }}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* -------------------- DYNAMICS CRM INTEGRATION MONITOR -------------------- */}
      {activeRole === 'crm' && (
        <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1>Dynamics 365 CRM Pipeline</h1>
            <p>Monitor bi-directional CRM integration logs, contact duplicate conflicts, and upserts in real-time.</p>
          </div>

          <div className="grid-3" style={{ gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
            <div>
              {/* Conflict Panel */}
              <div className="glass-card" style={{ borderColor: crmLogs.some(l => l.status === 'failed') ? 'hsl(var(--error))' : 'hsl(var(--border-glass))' }}>
                <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Contact Sync Conflicts</h3>
                {crmLogs.filter(l => l.status === 'failed').length === 0 ? (
                  <p style={{ fontSize: '13px' }}>No active contact sync conflicts found.</p>
                ) : (
                  (crmLogs || []).filter(l => l.status === 'failed').map((log) => {
                    const payloadObj = JSON.parse(log.payload || '{}');
                    return (
                      <div key={log.id} style={{ background: 'var(--error-glow)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Duplicate contact: "{payloadObj.first_name}"</div>
                        <div style={{ fontSize: '12px', color: 'hsl(var(--text-secondary))', margin: '4px 0' }}>Email: {payloadObj.email}</div>
                        <div style={{ fontSize: '11px', color: 'hsl(var(--error))', marginBottom: '12px' }}>{log.error}</div>
                        
                        <div style={{ background: 'rgba(2, 6, 23, 0.5)', padding: '8px', borderRadius: '6px', fontSize: '11px', marginBottom: '12px' }}>
                          CRM suggests linking to:
                          <div style={{ color: 'white', fontWeight: 'bold', marginTop: '4px' }}>Dynamics ID: CONT-82741</div>
                        </div>

                        <button 
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '11px', width: '100%' }}
                          onClick={() => handleCRMResolve(log.id, 'CONT-82741')}
                        >
                          Link & Resolve Conflict
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid hsl(var(--border-glass))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '16px' }}>CRM Integration Log Stream</h3>
                <span className="badge badge-outline" style={{ color: 'hsl(var(--success))' }}>Active Connection</span>
              </div>
              
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid hsl(var(--border-glass))' }}>
                      <th style={{ padding: '12px 24px' }}>Timestamp</th>
                      <th style={{ padding: '12px' }}>Operation</th>
                      <th style={{ padding: '12px' }}>Status</th>
                      <th style={{ padding: '12px' }}>CRM ID</th>
                      <th style={{ padding: '12px 24px' }}>Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crmLogs?.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid hsl(var(--border-glass))' }}>
                        <td style={{ padding: '12px 24px', color: 'hsl(var(--text-muted))' }}>
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                          {log.direction === 'to_crm' ? '📤 PUSH ' : '📥 PULL '} {log.entity_type}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span 
                            className="badge" 
                            style={{ 
                              background: log.status === 'success' ? 'var(--success-glow)' : 'var(--error-glow)', 
                              color: log.status === 'success' ? 'hsl(var(--success))' : 'hsl(var(--error))',
                              fontSize: '10px'
                            }}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontFamily: 'monospace' }}>{log.crm_id || '—'}</td>
                        <td style={{ padding: '12px 24px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'hsl(var(--text-secondary))' }}>
                          {log.payload}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* -------------------- TRANSACTIONAL EMAIL QUEUE -------------------- */}
      {activeRole === 'emails' && (
        <main style={{ flex: 1, padding: '32px 24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1>Transactional Email Queue</h1>
            <p>Inspect automatic lifecycle emails scheduled by event triggers (confirmations, receipts, and pre-event reminders).</p>
          </div>

          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid hsl(var(--border-glass))' }}>
                  <th style={{ padding: '16px 24px' }}>Trigger Type</th>
                  <th style={{ padding: '16px' }}>Recipient</th>
                  <th style={{ padding: '16px' }}>Subject Line</th>
                  <th style={{ padding: '16px' }}>Scheduled Send</th>
                  <th style={{ padding: '16px' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {emails?.map((email) => (
                  <tr key={email.id} style={{ borderBottom: '1px solid hsl(var(--border-glass))' }}>
                    <td style={{ padding: '16px 24px', textTransform: 'capitalize', fontWeight: 'bold' }}>{email.type}</td>
                    <td style={{ padding: '16px' }}>{email.recipient_email}</td>
                    <td style={{ padding: '16px' }}>{email.subject}</td>
                    <td style={{ padding: '16px', color: 'hsl(var(--text-secondary))' }}>
                      {new Date(email.send_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span 
                        className="badge" 
                        style={{ 
                          background: email.status === 'sent' ? 'var(--success-glow)' : 'rgba(255,255,255,0.03)',
                          color: email.status === 'sent' ? 'hsl(var(--success))' : 'hsl(var(--text-secondary))',
                          fontSize: '10px'
                        }}
                      >
                        {email.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => setViewingEmail(email)}>
                        Preview HTML
                      </button>
                      {email.status === 'pending' && (
                        <button className="btn btn-success" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={() => forceSendEmail(email.id)}>
                          Send Now
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* -------------------- HTML EMAIL PREVIEW MODAL -------------------- */}
      {viewingEmail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid hsl(var(--border-glass))' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>Subject: {viewingEmail.subject}</div>
                <div style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>To: {viewingEmail.recipient_email}</div>
              </div>
              <button onClick={() => setViewingEmail(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div 
              style={{ 
                flex: 1, 
                background: 'white', 
                color: 'black', 
                padding: '24px', 
                borderRadius: '8px', 
                overflowY: 'auto', 
                minHeight: '350px' 
              }}
              dangerouslySetInnerHTML={{ __html: viewingEmail.body_html }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
