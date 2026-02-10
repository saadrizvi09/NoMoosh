/**
 * Helper to check and restore onboarding completion status from the database
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export async function restoreOnboardingStatus() {
  try {
    const userId = localStorage.getItem("nomoosh_userId");
    if (!userId) {
      return {
        details: false,
        menu: false,
        cuisine: false,
        documents: false,
      };
    }

    const res = await fetch(`${API_BASE}/check-onboarding-status?user_id=${userId}`);
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status}`);
    }

    const status = await res.json();
    
    // Update localStorage with database status
    if (status.details) {
      localStorage.setItem("detailsCompleted", "true");
    }
    if (status.menu) {
      localStorage.setItem("menuCompleted", "true");
    }
    if (status.cuisine) {
      localStorage.setItem("cuisineTimesCompleted", "true");
    }
    if (status.documents) {
      localStorage.setItem("documentsCompleted", "true");
    }

    return status;
  } catch (error) {
    console.error("Failed to restore onboarding status:", error);
    return {
      details: false,
      menu: false,
      cuisine: false,
      documents: false,
    };
  }
}

export async function restoreOnboardingData() {
  try {
    const userId = localStorage.getItem("nomoosh_userId");
    if (!userId) {
      return null;
    }

    const res = await fetch(`${API_BASE}/get-onboarding-data?user_id=${userId}`);
    if (!res.ok) {
      throw new Error(`Data fetch failed: ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Failed to restore onboarding data:", error);
    return null;
  }
}
