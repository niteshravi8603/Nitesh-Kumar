import React, { useMemo, useState } from 'react';
import { Bus, Plus, Pencil, Trash2, Phone, User, MapPin } from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { TransportRoute } from '../../types/erp';
import { formatINR, sanitizeNumber } from '../../utils/formatters';
import { ModalShell } from '../ui/ModalShell';

export const TransportModule: React.FC = () => {
  const { db, canManageCampusOps, addRoute, updateRoute, deleteRoute, requestConfirm } =
    useSchool();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<TransportRoute | null>(null);
  const [formError, setFormError] = useState('');

  const [routeName, setRouteName] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [pickupPoints, setPickupPoints] = useState('');
  const [monthlyFare, setMonthlyFare] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');

  const routeStudentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    db.students.forEach((stu) => {
      if (stu.status !== 'Deactive' && stu.transportEnabled && stu.routeId) {
        counts[stu.routeId] = (counts[stu.routeId] || 0) + 1;
      }
    });
    return counts;
  }, [db.students]);

  const openAddModal = () => {
    setEditingRoute(null);
    setRouteName('');
    setBusNumber('');
    setPickupPoints('');
    setMonthlyFare('');
    setDriverName('');
    setDriverPhone('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (route: TransportRoute) => {
    setEditingRoute(route);
    setRouteName(route.routeName);
    setBusNumber(route.busNumber);
    setPickupPoints(route.pickupPoints || '');
    setMonthlyFare(String(route.monthlyFare));
    setDriverName(route.driverName);
    setDriverPhone(route.driverPhone);
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!routeName.trim()) {
      setFormError('Route name / coverage area is required.');
      return;
    }
    if (!busNumber.trim()) {
      setFormError('Bus registration number is required.');
      return;
    }
    if (!pickupPoints.trim()) {
      setFormError('Please specify key pickup points / stops along this route.');
      return;
    }
    const cleanFare = sanitizeNumber(monthlyFare, 0);
    if (cleanFare <= 0) {
      setFormError('Monthly fare must be greater than ₹0.');
      return;
    }
    if (!driverName.trim() || driverPhone.replace(/\D/g, '').length < 10) {
      setFormError('Driver name and a valid 10-digit driver contact number are required.');
      return;
    }

    if (editingRoute) {
      updateRoute(editingRoute.id, {
        routeName,
        busNumber,
        pickupPoints,
        monthlyFare: cleanFare,
        driverName,
        driverPhone,
      });
    } else {
      addRoute({
        routeName,
        busNumber,
        pickupPoints,
        monthlyFare: cleanFare,
        driverName,
        driverPhone,
      });
    }
    setModalOpen(false);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            03. Transport &amp; Route Manager (Route Chart)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure bus routes, pickup points, monthly fares, and driver contacts synced with the Admission Form
          </p>
        </div>

        {canManageCampusOps && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Transport Route</span>
          </button>
        )}
      </div>

      {db.routes.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Bus className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-900">No Active Bus Routes in Chart</h3>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Add your school bus routes, pickup stops, and monthly fares here. Active routes dynamically populate the Transport Route Chart switch inside the Advanced Admission Form.
          </p>
          {canManageCampusOps && (
            <button
              type="button"
              onClick={openAddModal}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Bus Route</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {db.routes.map((route) => {
            const riders = routeStudentCounts[route.id] || 0;
            return (
              <div
                key={route.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{route.routeName}</h3>
                      <p className="mt-0.5 font-mono text-xs font-medium text-indigo-700">
                        Bus {route.busNumber}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                        {formatINR(route.monthlyFare)}
                      </p>
                      <p className="text-[11px] text-slate-400">per month</p>
                    </div>
                  </div>

                  {route.pickupPoints && (
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="leading-relaxed">
                          <strong className="font-semibold text-slate-700">Pickup Points:</strong>{' '}
                          {route.pickupPoints}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-3.5 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <User className="h-3.5 w-3.5" />
                        <span>Driver</span>
                      </span>
                      <span className="font-medium text-slate-900">{route.driverName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <Phone className="h-3.5 w-3.5" />
                        <span>Contact</span>
                      </span>
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {route.driverPhone}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Assigned Students</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {riders} {riders === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                  </div>
                </div>

                {canManageCampusOps && (
                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(route)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        requestConfirm({
                          title: 'Delete Transport Route?',
                          description: `Delete "${route.routeName}" (${route.busNumber})? ${
                            riders > 0
                              ? `${riders} assigned student(s) will have transport switched OFF.`
                              : ''
                          }`,
                          confirmLabel: 'Delete Route',
                          destructive: true,
                          onConfirm: () => deleteRoute(route.id),
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRoute ? 'Edit Transport Route' : 'Add Route to Route Chart'}
        subtitle="Active routes dynamically populate the Transport Route dropdown in the Admission Form."
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Route Name / Area Coverage *
            </label>
            <input
              type="text"
              required
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="e.g. Route 01 — Civil Lines & Station Road"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Pickup Points / Stops *
            </label>
            <input
              type="text"
              required
              value={pickupPoints}
              onChange={(e) => setPickupPoints(e.target.value)}
              placeholder="e.g. Clock Tower, Gandhi Chowk, Bus Stand, Railway Crossing"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Bus Number *</label>
              <input
                type="text"
                required
                value={busNumber}
                onChange={(e) => setBusNumber(e.target.value)}
                placeholder="e.g. UP-14-BT-2041"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Monthly Fare (₹) *
              </label>
              <input
                type="number"
                min={1}
                step="1"
                required
                value={monthlyFare}
                onChange={(e) => setMonthlyFare(e.target.value)}
                placeholder="e.g. 850"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Driver Full Name *</label>
              <input
                type="text"
                required
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="e.g. Ramesh Yadav"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Driver Contact Mobile *
              </label>
              <input
                type="tel"
                required
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-600 focus:outline-none"
              />
            </div>
          </div>

          {formError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 whitespace-nowrap"
            >
              {editingRoute ? 'Update Route' : 'Save Route'}
            </button>
          </div>
        </form>
      </ModalShell>
    </section>
  );
};
