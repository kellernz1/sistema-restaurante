import {SettingsNavigation}from "@/features/settings/settings-navigation";
import {LicensePanel}from "@/features/licensing/license-panel";
import {requireStaff}from "@/lib/staff-api";
import "./license.css";
export default async function LicensePage(){await requireStaff(["admin"]);return <><SettingsNavigation active="license"/><LicensePanel/></>;}
