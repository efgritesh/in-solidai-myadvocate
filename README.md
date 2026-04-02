# My Advocate

A comprehensive case management system designed for advocates to efficiently manage their legal practice. Built as a mobile-first web application, it bridges the gap between advocates and their clients, enabling seamless handling of cases, hearings, payments, documents, and more.

## 🚀 Features

### Core Functionality
- **Dashboard**: Overview of upcoming hearings, reminders, and quick access to all modules
- **Case Management**: Create, update, and track legal cases with client associations
- **Client Management**: Maintain detailed client profiles and contact information
- **Hearing Management**: Schedule and track court hearings with reminders
- **Payment Tracking**: Record and monitor payments for cases
- **Document Management**: Upload and organize case-related documents with Firebase Storage

### Advocate Ownership
- Role-based data isolation: Each advocate sees only their own data
- Automatic data seeding with sample clients, cases, hearings, and payments on first login

### Mobile-First Design
- Responsive layouts optimized for mobile and tablet devices
- Hamburger navigation menu for easy mobile browsing
- Touch-friendly interfaces with full-width buttons and forms

### Multilingual Support
- English and Hindi language options
- Internationalization using react-i18next
- Language selection on app launch

### User Experience
- Firebase Authentication for secure login
- Profile setup with name, phone, address, and profile picture upload
- Invite system: Generate shareable links to invite other advocates
- Intuitive navigation with back buttons and consistent UI

## 🛠 Tech Stack

- **Frontend**: React 18 with Hooks
- **Routing**: React Router DOM
- **Styling**: Custom CSS with mobile-responsive design
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Internationalization**: react-i18next
- **File Uploads**: react-dropzone
- **Build Tool**: Create React App

## 📦 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd myadvocate
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Firebase**:
   - Update `src/firebase.js` with your Firebase project credentials
   - Ensure Firestore, Authentication, and Storage are enabled in your Firebase console

4. **Start the development server**:
   ```bash
   npm start
   ```
   The app will run on `http://localhost:3000`

5. **Build for production**:
   ```bash
   npm run build
   ```

## 📱 Usage

1. **Language Selection**: Choose your preferred language (English or Hindi) on the first screen
2. **Login**: Sign in with your email and password
3. **Profile Setup**: Complete your advocate profile (name, phone, address, profile picture)
4. **Dashboard**: Access all features from the main dashboard
5. **Invite Advocates**: Generate and share invite links to onboard other advocates
6. **Manage Data**: Add/edit clients, cases, hearings, payments, and documents

## 🔮 Future Enhancements

### High Priority
- **Client Portal**: Separate authentication for clients to view their case progress, documents, and payment history
- **Document Generation**: Automated PDF generation for legal documents, contracts, and reports
- **Push Notifications**: Real-time notifications for upcoming hearings and important updates
- **Advanced Search & Filtering**: Powerful search across all data with filters by date, status, etc.

### Medium Priority
- **Calendar Integration**: Sync hearings with Google Calendar or Outlook
- **Payment Gateway Integration**: Direct payment processing for client fees
- **Offline Support**: Progressive Web App (PWA) features for offline access
- **Data Export**: Export case data to PDF/Excel for reporting

### Low Priority
- **Multi-Language Expansion**: Add more languages (e.g., regional Indian languages)
- **Analytics Dashboard**: Insights on case success rates, revenue tracking, and performance metrics
- **Collaborative Features**: Allow multiple advocates to work on the same case
- **API Integration**: Connect with court APIs for automatic hearing updates
- **Backup & Restore**: Automated data backups and restore functionality

### Technical Improvements
- **Unit Testing**: Comprehensive test coverage with Jest and React Testing Library
- **Performance Optimization**: Code splitting, lazy loading, and caching strategies
- **Security Enhancements**: Implement rate limiting, input validation, and data encryption
- **Accessibility**: WCAG compliance for better usability

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For questions or support, please open an issue in the repository or contact the development team.

---

*Built with ❤️ for legal professionals*

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
