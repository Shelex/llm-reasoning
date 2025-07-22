export class EventsManager {
    constructor(ui) {
        this.ui = ui;
        this.events = [];
    }

    addEvent(event) {
        this.events.push({
            ...event,
            id: Date.now() + Math.random(),
            receivedAt: new Date().toISOString(),
        });

        if (this.ui.isEventsModalOpen()) {
            this.renderEventsHistory();
        }
    }

    clearEvents() {
        this.events = [];
    }

    getEvents() {
        return this.events;
    }

    renderEventsHistory() {
        const eventStats = this.getEventStats();

        this.ui.eventsContainer.innerHTML = `
            <div class="events-stats">
                <div class="stats-item">
                    <div class="stats-value">${eventStats.total}</div>
                    <div class="stats-label">Total Events</div>
                </div>
                <div class="stats-item">
                    <div class="stats-value">${eventStats.types}</div>
                    <div class="stats-label">Event Types</div>
                </div>
                <div class="stats-item">
                    <div class="stats-value">${eventStats.errors}</div>
                    <div class="stats-label">Errors</div>
                </div>
                <button class="clear-events-btn" onclick="app.clearEvents()">Clear Events</button>
            </div>
        `;

        if (this.events.length === 0) {
            this.ui.eventsContainer.innerHTML +=
                '<div class="no-events">No events recorded yet for this chat.</div>';
            return;
        }

        const sortedEvents = [...this.events].reverse();

        sortedEvents.forEach((event) => {
            const eventDiv = document.createElement("div");
            eventDiv.className = "event-item";
            eventDiv.dataset.eventId = event.id;

            const timestamp = new Date(event.receivedAt).toLocaleString();
            const payload = JSON.stringify(event, null, 2);

            eventDiv.innerHTML = `
                <div class="event-header" onclick="app.toggleEventPayload('${
                    event.id
                }')">
                    <div class="event-type ${event.type}">${event.type
                .replace(/_/g, " ")
                .toUpperCase()}</div>
                    <div class="event-meta">
                        <span class="event-timestamp">${timestamp}</span>
                        <span class="expand-icon">▶</span>
                    </div>
                </div>
                <div class="event-payload">
                    <div class="payload-content">${payload}</div>
                </div>
            `;

            this.ui.eventsContainer.appendChild(eventDiv);
        });
    }

    getEventStats() {
        const total = this.events.length;
        const types = new Set(this.events.map((e) => e.type)).size;
        const errors = this.events.filter((e) => e.type === "error").length;

        return { total, types, errors };
    }

    toggleEventPayload(eventId) {
        const eventItem = document.querySelector(
            `[data-event-id="${eventId}"]`
        );
        if (eventItem) {
            eventItem.classList.toggle("expanded");
        }
    }

    confirmClearEvents() {
        if (
            confirm("Are you sure you want to clear all events for this chat?")
        ) {
            this.clearEvents();
            this.renderEventsHistory();
            return true;
        }
        return false;
    }
}
