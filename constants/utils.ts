
/**
 * Parses a date string in "DD/MM/YYYY" format and returns a Date object.
 */
export function parseDate(dateStr: string): Date | null {
    if (!dateStr || dateStr.length !== 10) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-based
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    return new Date(year, month, day);
}

/**
 * Checks if a target date is within the start and end range (inclusive).
 * Dates are strings in "DD/MM/YYYY" format.
 */
export function isDateInRange(targetDateStr: string, startDateStr: string, endDateStr: string): boolean {
    const target = parseDate(targetDateStr);
    const start = parseDate(startDateStr);
    const end = parseDate(endDateStr);

    if (!target) return false;
    if (start && target < start) return false;
    if (end && target > end) return false;

    return true;
}
