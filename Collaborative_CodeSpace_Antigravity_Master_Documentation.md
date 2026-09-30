# Collaborative CodeSpace --- Antigravity Master Build Documentation

**Project Type:** Real-Time Collaborative Code Editor\
**Hackathon Prototype Constraint:** Maximum 12 hours for implementation\
**Primary Development Tool:** Google Antigravity\
**Document Purpose:** Single source of truth for planning, building,
testing, securing, and demonstrating the complete prototype.

------------------------------------------------------------------------

# 1. PROJECT OVERVIEW

## 1.1 Project Name

**Collaborative CodeSpace**

## 1.2 Tagline

> **Code Together. Communicate Together. Build Together.**

## 1.3 One-Line Description

Collaborative CodeSpace is a browser-based real-time development
workspace where multiple developers can edit code together, communicate
through chat, join a video call, execute code, and use AI coding
assistance from one shared project room.

## 1.4 Core Problem

Developers often use several separate tools during collaborative
development:

-   GitHub for code hosting and version control
-   VS Code or another IDE for coding
-   Zoom/Google Meet/Discord for communication
-   Separate chat tools for discussion
-   Separate environments for running and testing code
-   AI tools for coding assistance

This creates context switching and makes the live collaboration workflow
fragmented.

The project does NOT claim that existing tools cannot perform these
tasks. Instead, it focuses on bringing the most important collaboration
activities into one focused coding workspace.

## 1.5 Proposed Solution

Create a shared online coding room containing:

1.  Real-time collaborative code editor
2.  Live user presence
3.  Live cursor awareness
4.  Project/file explorer
5.  Real-time chat
6.  Video/audio calling
7.  Code execution and output
8.  AI coding assistant
9.  Room/member management
10. Basic project persistence
11. Security and access control

The core innovation for the prototype is the **combination of real-time
coding collaboration and communication in the same workspace**.

------------------------------------------------------------------------

# 2. EXISTING SOLUTIONS AND DIFFERENTIATION

## 2.1 Existing Solutions

### GitHub

GitHub is primarily used for:

-   Code hosting
-   Git-based version control
-   Pull requests
-   Code review
-   Issues
-   Collaboration around repositories

Our system is not intended to replace GitHub's version-control
ecosystem. The difference is that our prototype focuses on the **live
coding session**.

### VS Code Live Share

Live Share supports collaborative coding and is a strong existing
solution for real-time development.

Our differentiation should therefore NOT be:

> "No existing product supports collaborative coding."

Instead:

> "Our prototype explores a unified browser-based workspace that
> combines collaborative editing, communication, video calling, code
> execution and AI assistance in one room."

### Google Docs

Google Docs provides real-time collaborative editing, but it is not
designed around programming workflows such as:

-   syntax highlighting
-   code execution
-   project file structures
-   programming-language tooling
-   coding-specific AI assistance

### Zoom / Google Meet / Discord

These tools provide communication such as:

-   Video calls
-   Audio calls
-   Screen sharing
-   Chat

However, coding remains a separate activity.

### Replit and similar browser IDEs

Browser-based coding platforms can provide collaborative development
features, but feature availability, workflows, pricing, platform
dependencies, and collaboration models differ.

## 2.2 Problem-to-Solution Comparison

  -----------------------------------------------------------------------
  Existing Problem / Limitation       Collaborative CodeSpace
  ----------------------------------- -----------------------------------
  Code and communication often happen Coding + chat + video in one
  in different applications           workspace

  Developers may need to switch       Integrated collaboration room
  between editor and meeting tools    

  Local development can make live     Shared browser-based editor
  collaboration harder                

  Team members need awareness of who  Presence and live cursors
  is currently editing                

  Code review/discussion can happen   Contextual chat beside the code
  outside the editor                  

  Code execution may require a        Integrated run/output area
  separate environment                

  AI coding help may require another  Integrated AI assistant
  application                         

  New members need to coordinate      Room-based access and collaboration
  through multiple tools              
  -----------------------------------------------------------------------

## 2.3 Honest Positioning

Do not claim:

-   "GitHub cannot collaborate."
-   "No one has real-time coding."
-   "We invented collaborative coding."
-   "Our system completely replaces GitHub."
-   "Our video calling is better than Zoom."

Instead say:

> "We are building a unified collaborative coding workspace that brings
> live editing, communication, execution and AI assistance together for
> a focused development session."

------------------------------------------------------------------------

# 3. TARGET USERS

Primary users:

-   Student development teams
-   Hackathon teams
-   Pair programmers
-   Small software teams
-   Coding mentors and learners
-   Remote project teams

Example use case:

A four-person hackathon team creates one room. Two members edit code,
one reviews the implementation, and another joins the video call. All
members can communicate through room chat and run the shared code
without switching between several applications.

------------------------------------------------------------------------

# 4. PRODUCT GOALS

## 4.1 Primary Goals

The prototype must demonstrate:

1.  Multiple users entering the same room
2.  Real-time code synchronization
3.  Visible active users
4.  Shared project files
5.  Real-time chat
6.  Video/audio communication
7.  Code execution
8.  AI-assisted coding
9.  Secure room access
10. A polished and understandable user experience

## 4.2 Non-Goals for the 12-Hour Prototype

Do NOT attempt to build:

-   Full GitHub replacement
-   Production-grade Git hosting
-   Enterprise identity management
-   Full IDE-level language servers
-   Advanced CRDT/OT implementation from scratch
-   Large-scale video infrastructure from scratch
-   Arbitrary unrestricted server-side code execution
-   Complete CI/CD platform
-   Advanced cloud infrastructure
-   Enterprise billing
-   Large-scale distributed deployment

These may be future scope.

------------------------------------------------------------------------

# 5. CORE USER JOURNEY

## Step 1 --- Landing Page

User sees:

-   Product name
-   Short explanation
-   Create Room
-   Join Room
-   Login/Register

## Step 2 --- Authentication

User logs in or enters the prototype account.

## Step 3 --- Create or Join Room

Example:

`ROOM-7F3A`

User can:

-   Create a new room
-   Join using room ID
-   See room name
-   Set display name

## Step 4 --- Collaborative Workspace

The main workspace opens.

Layout:

``` text
+---------------------------------------------------------------+
| Collaborative CodeSpace     Room: TEAM-123     Users 3  Call |
+----------+------------------------------------+---------------+
| FILES    |            CODE EDITOR             | PARTICIPANTS  |
|          |                                    |               |
| main.py  |  def calculate(a, b):              | User A        |
| utils.py |      return a + b                  | User B        |
| README   |                                    | User C        |
|          |                                    |               |
+----------+------------------------------------+---------------+
| CHAT                         | VIDEO CALL                  |
| User A: check line 20        | A       B       C           |
| User B: fixed               | 🎤      📹      📞          |
+---------------------------------------------------------------+
| TERMINAL / OUTPUT                                           |
+---------------------------------------------------------------+
```

## Step 5 --- Collaborate

User A changes code.

The server receives the change.

Other connected users receive the update.

## Step 6 --- Communicate

Users can:

-   Send chat messages
-   Start/stop video
-   Mute/unmute
-   Turn camera on/off
-   See participants

## Step 7 --- Run Code

User clicks Run.

The system sends code to a controlled execution service/sandbox and
displays the output.

## Step 8 --- AI Assistance

User can:

-   Explain selected code
-   Detect possible bugs
-   Suggest improvements
-   Generate a small code snippet

------------------------------------------------------------------------

# 6. FUNCTIONAL REQUIREMENTS

## FR-01 Authentication

The system should allow users to:

-   Register/login
-   Maintain a session
-   Logout
-   Access protected workspace routes

For a hackathon prototype, authentication may use a simple secure
token/session architecture.

## FR-02 Room Creation

User can:

-   Create room
-   Generate unique room ID
-   Become room owner/host
-   Invite other users through room ID

## FR-03 Room Joining

User can:

-   Enter room ID
-   Join if authorized
-   See existing participants

Invalid room IDs must return a clear error.

## FR-04 Collaborative Editor

The editor must:

-   Support syntax highlighting
-   Allow typing/editing
-   Support at least one programming language
-   Synchronize changes
-   Display active collaborators

Recommended editor:

**Monaco Editor**

## FR-05 Real-Time Synchronization

Basic event flow:

``` text
User A edits
     |
     v
Client generates change event
     |
     v
WebSocket
     |
     v
Backend validates event
     |
     v
Broadcast to room
     |
     v
User B / C update editor
```

The implementation must prevent unnecessary full-document broadcasts
when possible.

For the 12-hour MVP, a practical synchronized-document model is
acceptable. Advanced CRDT/OT can be future scope.

## FR-06 Live Presence

Display:

-   Online users
-   Display names
-   Connection state
-   Optional active file

Example:

``` text
ONLINE
● Satyam
● Rahul
● Amit
```

## FR-07 Live Cursor

Where practical, display collaborator cursor/selection.

This feature is important for the demo but can be simplified if time is
limited.

## FR-08 File Explorer

Support:

-   Create file
-   Open file
-   Rename file
-   Delete file
-   Switch between files

Minimum prototype:

-   main.py
-   utils.py
-   README.md

## FR-09 Chat

Chat must be room-specific.

Required:

-   Send message
-   Receive message
-   Timestamp
-   User name
-   Scrollable message area
-   Basic message validation
-   Empty-message prevention

Optional:

-   Typing indicator
-   Emoji
-   Reply
-   Message reactions

## FR-10 Video Call

The video feature should support:

-   Join call
-   Leave call
-   Camera on/off
-   Microphone on/off
-   Participant display
-   Basic connection state
-   Optional screen sharing

Recommended approach:

Use WebRTC through a suitable library/service rather than implementing
an entire production video infrastructure from scratch.

The video layer is a collaboration feature, not the primary technical
innovation.

## FR-11 Code Execution

User clicks:

`RUN CODE`

System:

``` text
Code
  |
  v
Validation
  |
  v
Sandbox / controlled execution
  |
  v
Resource limits
  |
  v
Output
```

Never execute arbitrary user code directly on the main application
server.

For the hackathon MVP, support a limited language/runtime and strict
execution limits.

## FR-12 AI Assistant

AI assistant should support:

### Explain

Input:

``` python
for item in numbers:
    total += item
```

Output:

A short explanation of what the selected code does.

### Bug Analysis

Input selected code.

Output:

-   Possible issue
-   Why it may happen
-   Suggested fix

### Improve Code

AI can suggest readability/performance improvements.

### Generate Snippet

User describes a small coding task.

AI generates a code snippet.

AI responses must be clearly presented as suggestions rather than
guaranteed-correct code.

## FR-13 Project Persistence

Save:

-   Room information
-   Files
-   Basic project state
-   User metadata

------------------------------------------------------------------------

# 7. UI/UX SPECIFICATION

## 7.1 Landing Page

Required elements:

-   Logo/name
-   Tagline
-   Short explanation
-   Create Room button
-   Join Room button
-   Login button

## 7.2 Authentication Page

Fields:

-   Email/username
-   Password
-   Login
-   Register

## 7.3 Room Creation

Fields:

-   Room name
-   Programming language
-   Optional description

Output:

-   Room ID
-   Share/copy button
-   Enter Workspace

## 7.4 Main Workspace

Recommended layout:

``` text
Header
|
+-- Room Information
+-- Connection Status
+-- Participants
+-- Video Call
|
+-- Sidebar
|    +-- Files
|
+-- Main Editor
|
+-- Right/Bottom Panel
|    +-- Chat
|    +-- AI Assistant
|
+-- Bottom Panel
     +-- Terminal
     +-- Output
```

## 7.5 Connection Status

Show:

-   Connected
-   Connecting
-   Reconnecting
-   Offline

This is especially important for a real-time application.

------------------------------------------------------------------------

# 8. TECHNICAL ARCHITECTURE

## 8.1 Recommended Stack

### Frontend

-   React
-   TypeScript
-   Vite
-   Tailwind CSS
-   Monaco Editor

### Backend

Recommended:

-   FastAPI
-   Python
-   WebSockets

Alternative:

-   Node.js
-   Express
-   WebSocket/Socket.IO

Choose ONE backend approach and keep it consistent.

### Database

Possible options:

-   Supabase/PostgreSQL
-   PostgreSQL
-   SQLite for a lightweight local prototype

### Real-Time Layer

-   WebSockets for editor/chat/presence events

### Video

-   WebRTC
-   Or a suitable managed WebRTC/video SDK if permitted by hackathon
    rules

### AI

-   API-based LLM integration
-   Keep API keys server-side

### Code Execution

-   Sandboxed execution
-   Restricted runtime
-   Timeouts
-   Memory limits

------------------------------------------------------------------------

# 9. REAL-TIME EVENT ARCHITECTURE

Use room-based communication.

Example event:

``` json
{
  "type": "code_change",
  "room_id": "TEAM-123",
  "file_id": "main.py",
  "user_id": "user_42",
  "operation": "replace",
  "payload": "..."
}
```

Possible event types:

``` text
user_join
user_leave
code_change
cursor_move
file_create
file_delete
file_rename
chat_message
typing
run_code
execution_result
presence_update
```

The server should validate event type and required fields before
broadcasting.

------------------------------------------------------------------------

# 10. VIDEO CALL ARCHITECTURE

Preferred high-level architecture:

``` text
              Signaling Server
              /             \
             /               \
        User A  <---------->  User B
           \                   /
            \                 /
             \               /
              WebRTC Media
```

For a managed provider:

``` text
Frontend
   |
   +---- Auth / Room Backend
   |
   +---- Video SDK
           |
        Media Infrastructure
```

The implementation should avoid exposing secret server credentials in
frontend code.

Required UI:

-   Camera toggle
-   Mic toggle
-   Leave call
-   Participant tiles
-   Connection status

Optional:

-   Screen share
-   Active speaker
-   Picture-in-picture

------------------------------------------------------------------------

# 11. CHAT ARCHITECTURE

Chat messages should be associated with a room.

Example:

``` json
{
  "type": "chat_message",
  "room_id": "TEAM-123",
  "sender_id": "user_42",
  "message": "I fixed line 20",
  "timestamp": "..."
}
```

Validation:

-   Maximum message length
-   Empty-message rejection
-   Authentication
-   Room membership verification
-   Basic sanitization
-   Rate limiting

Do not render user messages as raw HTML.

------------------------------------------------------------------------

# 12. CODE EXECUTION SECURITY

This is one of the highest-risk components.

## Never do this

``` text
User Code
   ↓
Main Application Server
   ↓
OS Shell
```

## Preferred

``` text
User Code
   ↓
Validation
   ↓
Isolated Sandbox
   ↓
CPU Limit
Memory Limit
Time Limit
Network Restriction
   ↓
Output
```

Security controls:

-   Execution timeout
-   Memory limit
-   CPU limit
-   Restricted filesystem
-   Disable unnecessary network access
-   Process isolation
-   Maximum output size
-   Kill runaway processes
-   Validate language/runtime
-   Do not expose host credentials

If a fully secure sandbox cannot be implemented within the hackathon,
use a restricted demo execution environment and explicitly scope it as a
prototype.

------------------------------------------------------------------------

# 13. SECURITY REQUIREMENTS

## Authentication

-   Hash passwords using a suitable password hashing algorithm.
-   Never store plaintext passwords.
-   Use secure session/token handling.

## Authorization

Every protected operation must verify:

``` text
Is user authenticated?
        ↓
Is user a member of this room?
        ↓
Is user allowed to perform this action?
```

## API Security

-   Validate request body
-   Validate types
-   Validate lengths
-   Handle malformed input
-   Rate-limit sensitive endpoints

## WebSocket Security

-   Authenticate socket connection
-   Verify room membership
-   Validate event types
-   Limit message sizes
-   Handle disconnects
-   Prevent unauthorized room subscriptions

## Secrets

Never commit:

``` text
.env
API keys
JWT secrets
database passwords
video service secrets
private credentials
```

Create:

`.env.example`

with placeholders:

``` text
DATABASE_URL=
JWT_SECRET=
AI_API_KEY=
VIDEO_API_KEY=
```

## Git Security

Before pushing:

-   Check `.gitignore`
-   Search for API keys
-   Search for passwords
-   Search for private tokens
-   Remove debug credentials
-   Remove local database files if inappropriate
-   Review git diff
-   Review tracked files

------------------------------------------------------------------------

# 14. DATABASE DESIGN

Suggested tables:

## users

``` text
id
name
email
password_hash
created_at
```

## rooms

``` text
id
room_code
name
owner_id
created_at
```

## room_members

``` text
room_id
user_id
role
joined_at
```

## files

``` text
id
room_id
name
language
content
updated_at
```

## messages

``` text
id
room_id
sender_id
message
created_at
```

Optional:

## execution_logs

``` text
id
room_id
user_id
file_id
status
output
created_at
```

------------------------------------------------------------------------

# 15. ERROR HANDLING

The UI should never silently fail.

Examples:

### WebSocket disconnected

Show:

> Reconnecting...

### Room does not exist

Show:

> Room not found. Check the room ID and try again.

### Unauthorized access

Show:

> You do not have permission to access this room.

### Code execution timeout

Show:

> Execution timed out. The program exceeded the allowed runtime.

### AI failure

Show:

> AI service is temporarily unavailable. You can continue coding
> normally.

### Video connection failure

Show:

> Unable to establish video connection. Check camera/microphone
> permissions or network connectivity.

------------------------------------------------------------------------

# 16. TESTING PLAN

## Authentication tests

-   Valid login
-   Invalid password
-   Empty fields
-   Logout
-   Protected route access

## Room tests

-   Create room
-   Join room
-   Invalid room
-   Unauthorized room
-   Multiple users

## Editor tests

-   Type code
-   Save code
-   Open file
-   Create file
-   Delete file
-   Rename file

## Real-time tests

Test with at least two browser windows:

``` text
Window A → User A
Window B → User B
```

Test:

1.  A types
2.  B receives
3.  B types
4.  A receives
5.  Both edit quickly
6.  One refreshes
7.  One disconnects
8.  User reconnects

## Chat tests

-   Send message
-   Receive message
-   Long message
-   Empty message
-   Multiple users
-   Unauthorized room

## Video tests

-   Camera permission
-   Microphone permission
-   Join call
-   Leave call
-   Mute
-   Unmute
-   Camera toggle
-   Multiple participants
-   Reconnection

## Code execution tests

-   Valid code
-   Syntax error
-   Infinite loop
-   Large output
-   Timeout
-   Unsupported language
-   Malicious input

## AI tests

-   Explain code
-   Detect simple bug
-   Generate snippet
-   API failure
-   Missing API key
-   Long input

------------------------------------------------------------------------

# 17. 12-HOUR IMPLEMENTATION PLAN

The project MUST be developed according to priority.

## Hour 0--1 --- Project Setup

-   Initialize frontend
-   Initialize backend
-   Environment variables
-   Database
-   Basic routing
-   Git repository
-   `.gitignore`

**Deliverable:** App starts successfully.

## Hour 1--2 --- Authentication + Rooms

-   Login
-   Create room
-   Join room
-   Room ID
-   Basic access control

**Deliverable:** Two users can enter the same room.

## Hour 2--4 --- Collaborative Editor

-   Monaco Editor
-   WebSocket
-   Room connection
-   Code synchronization
-   Basic presence

**Deliverable:** User A changes code and User B sees it.

## Hour 4--5 --- File Explorer

-   Files
-   Create
-   Open
-   Rename
-   Delete

**Deliverable:** Shared project structure.

## Hour 5--6 --- Chat

-   Chat UI
-   WebSocket chat
-   Timestamps
-   User names
-   Validation

**Deliverable:** Two users can chat inside the coding room.

## Hour 6--8 --- Video Call

-   Video integration
-   Camera
-   Mic
-   Join/leave
-   Participant display
-   Basic reconnect handling

**Deliverable:** Two or more users can join the room call.

## Hour 8--9 --- Code Execution

-   Run button
-   Restricted execution
-   Output panel
-   Error handling

**Deliverable:** Demo code executes safely within defined limits.

## Hour 9--10 --- AI Assistant

-   Explain code
-   Bug detection
-   Suggestion
-   Error handling

**Deliverable:** AI interaction works.

## Hour 10--11 --- Security + Testing

-   Secrets check
-   Auth check
-   Room authorization
-   WebSocket validation
-   Code execution safety
-   Browser testing

## Hour 11--12 --- UI Polish + Demo

-   Fix major bugs
-   Responsive layout
-   Loading states
-   Empty states
-   Connection indicators
-   Demo data
-   Final test
-   Production build

------------------------------------------------------------------------

# 18. FEATURE PRIORITY

## P0 --- Must Work

1.  Authentication
2.  Create/join room
3.  Collaborative editor
4.  WebSocket synchronization
5.  Presence
6.  File explorer
7.  Chat
8.  Video call
9.  Basic code execution
10. Security basics

## P1 --- Strong Additions

1.  AI assistant
2.  Live cursors
3.  Screen sharing
4.  Reconnection
5.  Basic version history

## P2 --- Only If Time Remains

1.  Advanced CRDT
2.  Advanced analytics
3.  Multiple programming languages
4.  Git integration
5.  Advanced AI agent
6.  Advanced code review
7.  Voice commands
8.  Advanced permissions

------------------------------------------------------------------------

# 19. ANTIGRAVITY DEVELOPMENT RULES

Antigravity must NOT attempt to create the entire application blindly in
one operation.

Follow this workflow:

``` text
Read Documentation
      ↓
Understand Architecture
      ↓
Create Implementation Plan
      ↓
Implement One Ticket
      ↓
Run/Test
      ↓
Fix Errors
      ↓
Verify
      ↓
Move to Next Ticket
```

## Rule 1 --- Read this document first

Before modifying the project, understand:

-   Requirements
-   Architecture
-   Security
-   Feature priorities
-   Time constraint

## Rule 2 --- Do not rewrite working features unnecessarily

If an existing feature works:

-   Keep it
-   Improve only when necessary
-   Avoid destructive refactoring

## Rule 3 --- Keep frontend/backend contracts consistent

Any API/WebSocket change must update both sides.

## Rule 4 --- Test after each major feature

Do not wait until the final hour to discover that WebSocket
collaboration is broken.

## Rule 5 --- Never expose secrets

Use environment variables.

## Rule 6 --- Do not use fake functionality without marking it

If a feature is simulated for demonstration, clearly isolate it in the
code and documentation.

## Rule 7 --- Prefer working MVP over excessive features

A stable 8-feature product is better than a broken 20-feature product.

------------------------------------------------------------------------

# 20. ANTIGRAVITY MASTER INSTRUCTION

Use the following instruction as the main build instruction:

> You are the lead full-stack engineer responsible for building
> Collaborative CodeSpace according to this documentation.
>
> First inspect the existing project structure and identify the
> frontend, backend, database and configuration files.
>
> Do not immediately rewrite the application.
>
> First create an implementation plan based on the requirements in this
> document.
>
> Build the application incrementally according to feature priority.
>
> The project must support authentication, room creation/joining,
> real-time collaborative editing, user presence, file management,
> room-based chat, video/audio calling, safe code execution, and AI
> coding assistance.
>
> The central product experience is a shared coding room.
>
> Use a modern, clean, professional developer-tool UI. Avoid generic
> template-looking pages.
>
> Real-time functionality must use a proper WebSocket architecture. Do
> not fake synchronization with local-only state.
>
> Video calling must use WebRTC or a suitable supported video
> integration rather than implementing a custom media transport layer
> from scratch.
>
> Code execution must be isolated and resource-limited. Never directly
> execute untrusted user code on the main application server.
>
> All API keys and secrets must remain server-side and must never be
> committed to Git.
>
> Implement authentication and authorization for rooms.
>
> Validate all HTTP and WebSocket inputs.
>
> After every major feature:
>
> 1.  Run the application.
> 2.  Test the feature.
> 3.  Inspect browser console errors.
> 4.  Inspect backend errors.
> 5.  Fix problems.
> 6.  Continue only after the feature is stable.
>
> Prioritize P0 features before P1 and P2.
>
> Because the prototype must be completed within approximately 12 hours,
> do not spend excessive time implementing enterprise-level features.
>
> When a complex feature cannot safely be completed, implement a clearly
> scoped MVP rather than a fake production claim.
>
> Maintain clean code structure and clear separation between frontend,
> backend, real-time services, database and external services.
>
> Before finalizing:
>
> -   Run frontend build.
> -   Run backend.
> -   Test authentication.
> -   Test room creation/joining.
> -   Test two-user collaboration.
> -   Test chat.
> -   Test video.
> -   Test code execution.
> -   Test AI assistant.
> -   Check environment variables.
> -   Check `.gitignore`.
> -   Search the project for exposed secrets.
> -   Review important error states.
> -   Confirm the application can start from a clean environment.

------------------------------------------------------------------------

# 21. DEMO SCRIPT FOR JUDGES

The demo should be approximately 2--4 minutes.

## Scene 1 --- Problem

Say:

> "Today, developers often switch between an IDE, GitHub, chat
> applications and video meeting tools while working together. Our goal
> is to bring the live development session into one collaborative
> workspace."

## Scene 2 --- Create Room

Create:

`Hackathon-Team`

Show room ID.

## Scene 3 --- Two Users

Open second browser window.

Join the same room.

Show:

``` text
● User A
● User B
```

## Scene 4 --- Real-Time Editing

User A types code.

User B immediately sees the update.

Say:

> "Both developers are working on the same live code state."

## Scene 5 --- Chat

User B sends:

> "I found an issue in the function."

User A receives it without leaving the workspace.

## Scene 6 --- Video

Start video.

Show:

-   Camera
-   Mic
-   Participants

Say:

> "The team can also communicate through the same project room."

## Scene 7 --- Run Code

Click Run.

Show output.

## Scene 8 --- AI

Select code.

Click:

`Explain / Detect Bug`

Show AI result.

## Scene 9 --- Final Value

Say:

> "Instead of switching between separate tools for coding, communication
> and assistance, Collaborative CodeSpace provides a unified real-time
> workspace for the development session."

------------------------------------------------------------------------

# 22. WINNING/DIFFERENTIATION STRATEGY

The project should NOT compete with mature products feature-by-feature.

Instead emphasize:

### 1. Unified experience

Editor + chat + video + execution + AI.

### 2. Real-time collaboration

The main technical feature.

### 3. Context-aware communication

Chat and video happen inside the coding room.

### 4. AI assistance

AI is available without leaving the coding environment.

### 5. Hackathon/team use case

A team can enter one room and start building together.

------------------------------------------------------------------------

# 23. POSSIBLE JUDGE QUESTIONS

## Q1. How is this different from GitHub?

Answer:

> "GitHub is primarily a code hosting and version-control platform. Our
> prototype focuses on the live collaborative coding session by
> combining real-time editing, communication, execution and AI
> assistance in one workspace. We are not positioning it as a
> replacement for GitHub."

## Q2. How is this different from VS Code Live Share?

Answer:

> "Live Share is an important existing solution for collaborative
> coding. Our prototype explores a browser-based unified workspace where
> coding, room-based chat, video communication, execution and AI
> assistance are integrated into the same session."

## Q3. How does real-time synchronization work?

Answer:

> "Clients connect to a room through WebSockets. When a user makes an
> editor change, the client sends a structured change event to the
> server. The server validates it and broadcasts it to authorized room
> members."

## Q4. Are you using CRDT?

Answer:

> "For this 12-hour prototype we use a simplified synchronization model.
> A production implementation could adopt a mature CRDT or
> operational-transformation approach for stronger concurrent-edit
> conflict handling."

Do not falsely claim to have built a full CRDT if you have not.

## Q5. How is video implemented?

Answer:

> "We use WebRTC or a suitable video communication SDK rather than
> building a complete media infrastructure from scratch. The application
> handles room access and the collaboration UI while the media layer
> handles real-time audio/video."

## Q6. Is code execution safe?

Answer:

> "Untrusted code should never execute directly on the application
> server. Our architecture isolates execution with resource limits and
> restricted permissions. For the prototype, execution scope is
> intentionally limited."

## Q7. What happens if the internet disconnects?

Answer:

> "The client detects the connection loss, shows a reconnecting state,
> and attempts to re-establish the real-time connection. A production
> version would add stronger offline synchronization and conflict
> recovery."

## Q8. Can this replace GitHub?

Answer:

> "No. It complements version-control platforms rather than replacing
> them. The focus is the live development session."

------------------------------------------------------------------------

# 24. FUTURE SCOPE

Possible future improvements:

-   CRDT-based conflict-free collaboration
-   GitHub/GitLab integration
-   Pull request creation
-   Branch management
-   Advanced code review
-   AI pair programmer
-   AI-generated tests
-   AI security scanning
-   Voice-based coding assistant
-   Persistent video meeting rooms
-   Advanced role-based permissions
-   Cloud sandbox infrastructure
-   Multi-language execution
-   Offline-first collaboration
-   Enterprise deployment
-   Audit logs
-   Advanced analytics

------------------------------------------------------------------------

# 25. SUCCESS CRITERIA

The prototype is considered successful if:

-   Two or more users can enter the same room.
-   Users can edit the same code workspace.
-   Code changes synchronize in real time.
-   Online participants are visible.
-   Users can send chat messages.
-   Users can join a video call.
-   Users can execute supported code safely within defined limits.
-   AI assistance works for basic coding tasks.
-   Unauthorized users cannot access protected rooms.
-   No API secrets are committed.
-   Frontend builds successfully.
-   Backend starts successfully.
-   Main demo flow works without manual database manipulation.

------------------------------------------------------------------------

# 26. FINAL PRE-GITHUB CHECKLIST

## Code

-   [ ] No debug code
-   [ ] No unnecessary console logs
-   [ ] No hardcoded credentials
-   [ ] No fake production claims
-   [ ] Clean folder structure
-   [ ] README updated

## Secrets

-   [ ] `.env` ignored
-   [ ] API keys checked
-   [ ] Database credentials checked
-   [ ] JWT secrets checked
-   [ ] Video credentials checked
-   [ ] AI credentials checked

## Security

-   [ ] Authentication tested
-   [ ] Room authorization tested
-   [ ] WebSocket validation tested
-   [ ] Chat input sanitized
-   [ ] Code execution restricted
-   [ ] API rate limits considered

## Testing

-   [ ] Two browser windows tested
-   [ ] Three-user test if possible
-   [ ] Chat tested
-   [ ] Video tested
-   [ ] Code sync tested
-   [ ] Reconnection tested
-   [ ] AI tested
-   [ ] Code execution tested

## Git

Before push:

``` bash
git status
git diff
git ls-files
```

Search for:

``` text
API_KEY
SECRET
PASSWORD
TOKEN
DATABASE_URL
PRIVATE_KEY
```

Then commit only reviewed files.

------------------------------------------------------------------------

# 27. FINAL PRODUCT STATEMENT

**Collaborative CodeSpace** is a real-time collaborative development
workspace designed to reduce tool switching during team coding sessions.

It combines:

> **Shared Code Editor + Real-Time Sync + Presence + Chat + Video Call +
> Code Execution + AI Assistance**

The project does not attempt to replace mature platforms such as GitHub,
VS Code Live Share, or video-conferencing platforms. Instead, it
demonstrates how these collaboration needs can be unified into one
focused browser-based development room.

**Core message:**

> **Code Together. Communicate Together. Build Together.**
