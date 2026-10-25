export function sqlTestDatabase() {
  const name=process.env.SQL_TEST_DATABASE || "postgres";
  if(name!=="postgres"&&!/^mesa_clean_[a-f0-9]{24}$/.test(name))throw new Error("Unrecognized SQL test database");
  return name;
}
