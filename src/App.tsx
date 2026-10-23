import { Route, Routes } from "react-router-dom";
import AuthProvider from "./features/auth/AuthProvider";
import SignInPage from "./features/auth/SignInPage";
import HomePage from "./features/home/HomePage";
import SettingsPage from "./features/settings/SettingsPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/signin" element={<SignInPage />} />
      </Routes>
    </AuthProvider>
  );
}
