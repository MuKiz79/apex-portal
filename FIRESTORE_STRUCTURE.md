# Karriaro Inner Circle - Firestore Struktur

## Collections

### 1. `waitlist` - Warteliste für Inner Circle
```
{
  id: auto-generated,
  name: string,
  email: string,
  linkedin: string,
  currentRole: string,
  company: string,
  yearsExperience: number,
  reason: string (Warum Inner Circle?),
  status: "pending" | "reviewing" | "interview_scheduled" | "approved" | "rejected",
  submittedAt: timestamp,
  reviewedBy: userId (admin),
  reviewedAt: timestamp,
  notes: string (Admin-Notizen),
  interviewDate: timestamp,
  interviewNotes: string
}
```

### 2. `members` - Freigeschaltete Inner Circle Members
```
{
  id: userId (Firebase Auth UID),
  name: string,
  email: string,
  linkedin: string,
  role: string,
  company: string,
  memberSince: timestamp,
  memberNumber: number (z.B. #0042),
  karma: number (für Contribution Tracking),
  industries: array<string>,
  functions: array<string>,
  isActive: boolean,
  lastActive: timestamp
}
```

### 3. `headhunters` - Headhunter/Search Firms Database
```
{
  id: auto-generated,
  firmName: string,
  website: string,
  focus: array<string> (Industries/Functions),
  region: "DACH" | "EU" | "Global",
  addedBy: userId,
  addedAt: timestamp,
  averageRating: number (calculated),
  reviewCount: number (calculated),
  verified: boolean
}
```

### 4. `headhunter_reviews` - Reviews von Members
```
{
  id: auto-generated,
  headhunterId: string,
  reviewerId: userId,
  rating: number (1-5),
  professionalismRating: number (1-5),
  communicationRating: number (1-5),
  successRating: number (1-5),
  experience: string (Text-Review),
  mandate: string (optional: Welches Mandat),
  outcome: "hired" | "interviewed" | "rejected" | "ghosted",
  wouldRecommend: boolean,
  anonymous: boolean,
  createdAt: timestamp,
  helpful: number (Anzahl "helpful" votes)
}
```

### 5. `opportunities` - Geteilte Vakanzen
```
{
  id: auto-generated,
  sharedBy: userId,
  title: string,
  company: string (optional, kann anonym sein),
  industry: string,
  function: string,
  location: string,
  level: "Manager" | "Director" | "VP" | "C-Level" | "Board",
  salaryRange: string (optional),
  description: string,
  status: "🔴 Unbestätigt" | "🟡 Bestätigt" | "🟢 Live",
  source: "Headhunter Contact" | "Company Insider" | "Market Intel",
  headhunterId: string (optional),
  contactInfo: string,
  expiresAt: timestamp,
  createdAt: timestamp,
  views: number,
  interested: array<userId>
}
```

### 6. `forum_posts` - Community Diskussionen
```
{
  id: auto-generated,
  authorId: userId,
  category: "Strategy" | "Headhunter Intel" | "Salary Negotiation" | "Career Advice" | "General",
  title: string,
  content: string,
  tags: array<string>,
  createdAt: timestamp,
  updatedAt: timestamp,
  views: number,
  likes: number,
  replyCount: number
}
```

### 7. `forum_replies` - Antworten auf Posts
```
{
  id: auto-generated,
  postId: string,
  authorId: userId,
  content: string,
  createdAt: timestamp,
  likes: number,
  parentReplyId: string (optional, für nested replies)
}
```

### 8. `activities` - Activity Feed
```
{
  id: auto-generated,
  userId: userId,
  type: "review_posted" | "opportunity_shared" | "post_created" | "member_joined",
  targetId: string (ID des Reviews/Opportunity/Posts),
  createdAt: timestamp
}
```

## Karma-Punkte System

- **Opportunity teilen**: +10 Karma
- **Headhunter-Review schreiben**: +5 Karma
- **Forum-Post erstellen**: +3 Karma
- **Hilfreiche Antwort**: +2 Karma
- **Opportunity wird angenommen**: +20 Karma (Bonus)

## Member Levels (basierend auf Karma)

- **0-50 Karma**: Explorer
- **51-200 Karma**: Contributor
- **201-500 Karma**: Insider
- **501+ Karma**: Elite

Höhere Levels = Früherer Zugang zu Top-Opportunities
