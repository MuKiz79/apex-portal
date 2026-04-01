// Karriaro - Shared State Module
// Zentraler State der über alle Module geteilt wird

// Pagination State
export const paginationState = {
    users: { page: 1, total: 0, data: [], filteredData: [], searchTerm: '', filter: 'all' },
    orders: { page: 1, total: 0, data: [] },
    calls: { page: 1, total: 0, data: [] },
    docs: { page: 1, total: 0, data: [] },
    coaches: { page: 1, total: 0, data: [] }
};

// Mentor State (gesetzt beim Login wenn User ein Mentor ist)
export let currentMentorData = null;

export function setCurrentMentorData(data) {
    currentMentorData = data;
}

// Admin Claim Cache
export let cachedAdminClaim = null;

export function setCachedAdminClaim(value) {
    cachedAdminClaim = value;
}
